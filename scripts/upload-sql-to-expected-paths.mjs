/**
 * Upload SQL files to the blob paths expected by analysis_pack_inputs.
 * The pack inputs reference sql/agt_noms.sql and sql/ice_cash_and_balmo.sql
 * but the local files live under sql/core/ with numeric prefixes.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const require = createRequire(path.join(ROOT, "frontend", "package.json"));
const { BlobServiceClient } = require("@azure/storage-blob");

// Load frontend/.env.local
const envFile = fs.readFileSync(path.join(ROOT, "frontend", ".env.local"), "utf-8");
for (const line of envFile.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  const key = t.slice(0, i).trim();
  const val = t.slice(i + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "helioscta-workspaces";
const blobService = BlobServiceClient.fromConnectionString(connStr);
const container = blobService.getContainerClient(containerName);

const FILES = [
  {
    local: ".prompts/agt_pipe_balance/sql/core/10_agt_noms.sql",
    blob: "projects/agt_pipe_balance/sql/agt_noms.sql",
  },
  {
    local: ".prompts/agt_pipe_balance/sql/core/20_ice_cash_and_balmo.sql",
    blob: "projects/agt_pipe_balance/sql/ice_cash_and_balmo.sql",
  },
  {
    local: ".prompts/agt_pipe_balance/assets/maps/algonquin_gas_transmission.json",
    blob: "projects/agt_pipe_balance/reports/algonquin_gas_transmission.json",
  },
];

for (const { local, blob } of FILES) {
  const content = fs.readFileSync(path.join(ROOT, local));
  const blockBlob = container.getBlockBlobClient(blob);
  await blockBlob.upload(content, content.length, {
    blobHTTPHeaders: { blobContentType: "text/x-sql" },
  });
  console.log(`Uploaded ${blob} (${content.length} bytes)`);
}

console.log("Done");
