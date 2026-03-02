/**
 * Upload an analysis pack's files from .prompts/<pack_slug>/ to Azure Blob Storage
 * and register them in helioscta_agents.workspace_files.
 *
 * Usage:  node scripts/upload-pack-to-blob.mjs <pack_slug>
 * Example: node scripts/upload-pack-to-blob.mjs agt_pipe_balance
 *
 * Run from repo root. Resolves npm packages from frontend/node_modules.
 */

import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FRONTEND_ENV = path.join(ROOT, "frontend", ".env.local");

// Resolve packages from frontend/node_modules
const require = createRequire(path.join(ROOT, "frontend", "package.json"));
const { BlobServiceClient } = require("@azure/storage-blob");
const pg = require("pg");

// Parse .env.local manually (no dotenv dependency)
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
loadEnvFile(FRONTEND_ENV);

const PACK_SLUG = process.argv[2];
if (!PACK_SLUG) {
  console.error("Usage: node scripts/upload-pack-to-blob.mjs <pack_slug>");
  process.exit(1);
}

const PACK_DIR = path.join(ROOT, ".prompts", PACK_SLUG);
if (!fs.existsSync(PACK_DIR)) {
  console.error(`Pack directory not found: ${PACK_DIR}`);
  process.exit(1);
}

// Mime type map
const MIME_MAP = {
  md: "text/markdown",
  csv: "text/csv",
  py: "text/x-python",
  sql: "text/x-sql",
  png: "image/png",
  svg: "image/svg+xml",
  json: "application/json",
  txt: "text/plain",
  html: "text/html",
  mhtml: "application/x-mimearchive",
};

function getMime(fileName) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "txt";
  return MIME_MAP[ext] ?? "application/octet-stream";
}

function getFileType(fileName) {
  return fileName.split(".").pop()?.toLowerCase() ?? "txt";
}

// Recursively collect files (skip .claude/ directory)
function collectFiles(dir, base = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === ".claude" || entry.name === "node_modules") continue;
      files.push(...collectFiles(path.join(dir, entry.name), rel));
    } else {
      files.push(rel);
    }
  }
  return files;
}

async function main() {
  // --- Azure Blob client ---
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr) {
    console.error("Missing AZURE_STORAGE_CONNECTION_STRING in frontend/.env.local");
    process.exit(1);
  }
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME ?? "helioscta-workspaces";
  const blobService = BlobServiceClient.fromConnectionString(connStr);
  const container = blobService.getContainerClient(containerName);

  // --- Postgres client ---
  const pool = new pg.Pool({
    host: process.env.AZURE_POSTGRESQL_DB_HOST,
    port: parseInt(process.env.AZURE_POSTGRESQL_DB_PORT ?? "5432"),
    user: process.env.AZURE_POSTGRESQL_DB_USER,
    password: process.env.AZURE_POSTGRESQL_DB_PASSWORD,
    database: "helioscta",
    ssl: { rejectUnauthorized: false },
  });

  // Look up workspace
  const wsResult = await pool.query(
    `SELECT workspace_id, slug FROM helioscta_agents.workspaces WHERE slug = $1`,
    [PACK_SLUG]
  );
  if (wsResult.rows.length === 0) {
    console.error(`Workspace not found for slug: ${PACK_SLUG}`);
    await pool.end();
    process.exit(1);
  }
  const { workspace_id: workspaceId, slug: wsSlug } = wsResult.rows[0];
  console.log(`Workspace: ${wsSlug} (id=${workspaceId})`);

  // Collect local files
  const localFiles = collectFiles(PACK_DIR);
  console.log(`Found ${localFiles.length} files to upload\n`);

  let uploaded = 0;

  for (const relPath of localFiles) {
    const localFilePath = path.join(PACK_DIR, relPath);
    const fileName = path.basename(relPath);
    const parentDir = path.dirname(relPath);
    const parentPath = parentDir === "." ? "/" : `/${parentDir}/`;
    const blobPath = `projects/${wsSlug}/${relPath}`;
    const mimeType = getMime(fileName);
    const fileType = getFileType(fileName);

    // Read file
    const content = fs.readFileSync(localFilePath);
    const sizeBytes = content.length;

    // Upload to blob
    const blockBlob = container.getBlockBlobClient(blobPath);
    await blockBlob.upload(content, sizeBytes, {
      blobHTTPHeaders: { blobContentType: mimeType },
    });

    // Upsert into workspace_files
    await pool.query(
      `INSERT INTO helioscta_agents.workspace_files
         (workspace_id, file_name, blob_path, file_type, mime_type, size_bytes, parent_path, source, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'upload', 'script')
       ON CONFLICT (blob_path) DO UPDATE SET
         size_bytes = EXCLUDED.size_bytes,
         updated_at = NOW(),
         is_active = TRUE`,
      [workspaceId, fileName, blobPath, fileType, mimeType, sizeBytes, parentPath]
    );

    console.log(`  [OK] ${blobPath}  (${sizeBytes} bytes)`);
    uploaded++;
  }

  console.log(`\nDone: ${uploaded} files uploaded`);
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
