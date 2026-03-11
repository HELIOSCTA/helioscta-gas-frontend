/* ──────────────────────────────────────────────────────────
   MCP server config loader
   Reads MCP_SERVERS env var (JSON array) and returns typed configs
   for use with @ai-sdk/mcp.
   ───────────────────────────────────────────────────────── */

export interface McpServerConfig {
  name: string;
  transport: "sse" | "http";
  url: string;
  headers?: Record<string, string>;
}

/**
 * Parse the MCP_SERVERS env var into typed configs.
 * Returns an empty array if the var is unset or unparseable.
 */
export function loadMcpServers(): McpServerConfig[] {
  const raw = process.env.MCP_SERVERS;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is McpServerConfig =>
        typeof s === "object" &&
        s !== null &&
        typeof s.name === "string" &&
        typeof s.url === "string" &&
        (s.transport === "sse" || s.transport === "http")
    );
  } catch {
    console.error("[mcp-config] Failed to parse MCP_SERVERS env var");
    return [];
  }
}
