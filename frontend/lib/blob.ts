import {
  BlobServiceClient,
  ContainerClient,
} from "@azure/storage-blob";

declare global {
  var _blobContainerClient: ContainerClient | undefined;
}

function createContainerClient(): ContainerClient {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("Missing AZURE_STORAGE_CONNECTION_STRING");
  }
  const containerName =
    process.env.AZURE_STORAGE_CONTAINER_NAME ?? "helioscta-workspaces";

  const blobService =
    BlobServiceClient.fromConnectionString(connectionString);
  return blobService.getContainerClient(containerName);
}

function getContainer(): ContainerClient {
  if (process.env.NODE_ENV === "production") {
    return createContainerClient();
  }
  if (!globalThis._blobContainerClient) {
    globalThis._blobContainerClient = createContainerClient();
  }
  return globalThis._blobContainerClient;
}

export async function uploadBlob(
  path: string,
  content: Buffer | string,
  contentType: string
): Promise<void> {
  const container = getContainer();
  const blockBlob = container.getBlockBlobClient(path);
  const data = typeof content === "string" ? Buffer.from(content) : content;
  await blockBlob.upload(data, data.length, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

export async function downloadBlob(path: string): Promise<Buffer> {
  const container = getContainer();
  const blockBlob = container.getBlockBlobClient(path);
  try {
    return await blockBlob.downloadToBuffer();
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    const detail = e.statusCode === 404
      ? `Blob not found: ${path}`
      : `Blob download failed (${e.statusCode ?? e.code ?? "unknown"}): ${path}`;
    throw new Error(detail, { cause: err });
  }
}

export async function deleteBlob(path: string): Promise<void> {
  const container = getContainer();
  const blockBlob = container.getBlockBlobClient(path);
  await blockBlob.deleteIfExists();
}
