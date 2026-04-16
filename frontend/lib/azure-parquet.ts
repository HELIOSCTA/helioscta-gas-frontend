import {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet";

// ---------------------------------------------------------------------------
// Global row cache (survives hot-reloads in dev)
// ---------------------------------------------------------------------------
interface RowCacheEntry {
  rows: unknown[];
  fetchedAt: number;
}

interface BlobMetaEntry {
  lastModifiedUtc: string | null;
  contentLengthBytes: number | null;
  etag: string | null;
  fetchedAt: number;
}

declare global {
  var _parquetRowCache: Map<string, RowCacheEntry> | undefined;
  var _parquetBlobMetaCache: Map<string, BlobMetaEntry> | undefined;
}

export const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes — row cache
const BLOB_META_TTL_MS = 60 * 1000; // 1 minute — Azure getProperties cache

const rowCache: Map<string, RowCacheEntry> =
  process.env.NODE_ENV === "production"
    ? new Map()
    : (globalThis._parquetRowCache ??
      (globalThis._parquetRowCache = new Map()));

const blobMetaCache: Map<string, BlobMetaEntry> =
  process.env.NODE_ENV === "production"
    ? new Map()
    : (globalThis._parquetBlobMetaCache ??
      (globalThis._parquetBlobMetaCache = new Map()));

// In-flight dedup: if multiple requests hit a cold cache simultaneously,
// only one Parquet read runs — the rest await the same promise.
const inFlight = new Map<string, Promise<unknown[]>>();

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------
function getCredentials(): {
  accountName: string;
  accountKey: string;
  blobServiceClient: BlobServiceClient;
} {
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr) throw new Error("Missing AZURE_STORAGE_CONNECTION_STRING");

  const accountName =
    process.env.AZURE_STORAGE_ACCOUNT_NAME ??
    connStr.match(/AccountName=([^;]+)/)?.[1];
  const accountKey = connStr.match(/AccountKey=([^;]+)/)?.[1];

  if (!accountName || !accountKey) {
    throw new Error(
      "Cannot parse AccountName/AccountKey from connection string"
    );
  }

  return {
    accountName,
    accountKey,
    blobServiceClient: BlobServiceClient.fromConnectionString(connStr),
  };
}

// ---------------------------------------------------------------------------
// Generate a short-lived SAS URL for a blob (read-only, 30 min)
// ---------------------------------------------------------------------------
function generateSasUrl(container: string, blobPath: string): string {
  const { accountName, accountKey, blobServiceClient } = getCredentials();

  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const expiresOn = new Date(Date.now() + 30 * 60 * 1000);

  const sas = generateBlobSASQueryParameters(
    {
      containerName: container,
      blobName: blobPath,
      permissions: BlobSASPermissions.parse("r"),
      expiresOn,
    },
    credential
  ).toString();

  const containerClient = blobServiceClient.getContainerClient(container);
  const blobClient = containerClient.getBlobClient(blobPath);
  return `${blobClient.url}?${sas}`;
}

// ---------------------------------------------------------------------------
// Internal: fetch + parse (runs once per cache miss)
// ---------------------------------------------------------------------------
async function fetchAndParse(
  container: string,
  blobPath: string
): Promise<unknown[]> {
  const url = generateSasUrl(container, blobPath);
  const file = await asyncBufferFromUrl({ url });
  return await parquetReadObjects({ file });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read all rows from a Parquet file in Azure Blob Storage.
 *
 * The full dataset is cached in-process for 15 minutes. After the first
 * (cold) read, subsequent calls return instantly from memory — filtering
 * 100k+ rows in JS takes microseconds.
 *
 * Concurrent cold requests are de-duped so only one Parquet read runs.
 */
export async function readParquet<T>(
  container: string,
  blobPath: string
): Promise<T[]> {
  const key = `${container}/${blobPath}`;

  // 1. Warm cache hit → instant return
  const cached = rowCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rows as T[];
  }

  // 2. Another request is already fetching → await it
  let promise = inFlight.get(key);
  if (!promise) {
    // 3. Cold miss → kick off a single fetch
    promise = fetchAndParse(container, blobPath);
    inFlight.set(key, promise);
  }

  try {
    const rows = await promise;
    rowCache.set(key, { rows, fetchedAt: Date.now() });
    return rows as T[];
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Force-clear the row cache for a specific blob (or all blobs).
 * Useful if you know the backend just synced new data.
 */
export function invalidateCache(container?: string, blobPath?: string): void {
  if (container && blobPath) {
    rowCache.delete(`${container}/${blobPath}`);
    blobMetaCache.delete(`${container}/${blobPath}`);
  } else {
    rowCache.clear();
    blobMetaCache.clear();
  }
}

// ---------------------------------------------------------------------------
// Parquet dataset metadata (Azure blob + local cache state)
// ---------------------------------------------------------------------------

export interface ParquetMeta {
  container: string;
  blobPath: string;
  /** When Azure says the blob was last modified (ISO UTC). */
  lastModifiedUtc: string | null;
  contentLengthBytes: number | null;
  etag: string | null;
  /** When our server-side row cache last downloaded + parsed this blob (ISO UTC, null if not cached). */
  downloadedAtUtc: string | null;
  /** When our server-side row cache expires (ISO UTC, null if not cached). */
  cacheExpiresAtUtc: string | null;
  cacheTtlMs: number;
}

export async function getParquetMeta(
  container: string,
  blobPath: string
): Promise<ParquetMeta> {
  const key = `${container}/${blobPath}`;

  let entry = blobMetaCache.get(key);
  if (!entry || Date.now() - entry.fetchedAt > BLOB_META_TTL_MS) {
    const { blobServiceClient } = getCredentials();
    const blobClient = blobServiceClient
      .getContainerClient(container)
      .getBlobClient(blobPath);
    const props = await blobClient.getProperties();
    entry = {
      lastModifiedUtc: props.lastModified?.toISOString() ?? null,
      contentLengthBytes: props.contentLength ?? null,
      etag: props.etag ?? null,
      fetchedAt: Date.now(),
    };
    blobMetaCache.set(key, entry);
  }

  const cached = rowCache.get(key);
  return {
    container,
    blobPath,
    lastModifiedUtc: entry.lastModifiedUtc,
    contentLengthBytes: entry.contentLengthBytes,
    etag: entry.etag,
    downloadedAtUtc: cached ? new Date(cached.fetchedAt).toISOString() : null,
    cacheExpiresAtUtc: cached
      ? new Date(cached.fetchedAt + CACHE_TTL_MS).toISOString()
      : null,
    cacheTtlMs: CACHE_TTL_MS,
  };
}
