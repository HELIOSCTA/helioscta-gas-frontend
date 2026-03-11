## Postgres MCP Setup Plan (Project-Scoped Claude + Frontend Runtime)

### Summary
Implement Postgres MCP in two tracks:
1. Add a persistent **project-scoped** Claude MCP server using `@modelcontextprotocol/server-postgres`, with credentials injected via env var wrapper (not inline URI in config).
2. Add an **HTTP MCP gateway sidecar** for your frontend runtime agent so Workbench chat can use Postgres tools in-app.

This matches your selected defaults: `Both now`, `Project scope`, `Env var wrapper`, `HTTP gateway`, `New sidecar service`.

### Current-State Facts (already validated)
1. `claude mcp list` currently shows no `postgres` server configured.
2. Claude CLI supports scopes (`local`, `user`, `project`) and stdio MCP add syntax.
3. Repo currently has no MCP runtime integration in chat route, and no `@ai-sdk/mcp` package in frontend.
4. Repo already has direct Postgres connectivity and SQL guardrails, which we will keep as fallback.

### Phase 1: Claude Project MCP (local development agent)
1. Create a local wrapper script (outside repo) at `%USERPROFILE%\.claude\scripts\start-postgres-mcp.ps1`:
```powershell
param(
  [string]$ConnectionString = $env:HELIOSCTA_PG_MCP_URI
)

if (-not $ConnectionString) {
  Write-Error "HELIOSCTA_PG_MCP_URI is not set."
  exit 1
}

npx -y @modelcontextprotocol/server-postgres $ConnectionString
```
2. Set persistent user env var once:
```powershell
setx HELIOSCTA_PG_MCP_URI "postgresql://helioscta:admin!2024@heliosctadb.postgres.database.azure.com:5432/helioscta?sslmode=require"
```
3. Open a new terminal so env var is loaded.
4. Add project-scoped MCP server:
```powershell
claude mcp add --scope project postgres -- powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.claude\scripts\start-postgres-mcp.ps1"
```
5. Verify:
```powershell
claude mcp list
claude mcp get postgres
```

### Phase 2: Frontend Runtime MCP (Workbench agent)
1. Add new sidecar service `mcp-postgres-gateway` in `docker-compose` (port `3101`, internal network).
2. Build gateway as a Node service with:
- `@modelcontextprotocol/sdk`
- `pg`
- `zod`
3. Gateway exposes MCP over HTTP at `POST /mcp` with bearer auth header.
4. Gateway tools:
- `query(sql: string)` read-only only
- `list_tables(schema?: string)` for discovery
- `describe_table(schema: string, table: string)` for schema introspection
5. Query safety in gateway:
- Reject non-read-only SQL (same forbidden keyword policy as existing validator).
- Execute in read-only transaction.
- Apply statement timeout and row cap (default 200 rows, `truncated` flag).
6. Frontend chat route integration:
- Add `@ai-sdk/mcp` to frontend deps.
- Create cached MCP client utility in server runtime.
- In chat route, when flag enabled, load MCP tools and pass to `streamText` with `toolChoice: "auto"` and bounded steps.
- Preserve existing DB/native tooling as fallback if MCP fails.
7. Prompt update:
- Explicitly instruct agent to use MCP tools before asking user to paste data.

### Planned Repo Changes
1. Update [docker-compose.yml](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/docker-compose.yml) with `mcp-postgres-gateway` service.
2. Add new `mcp-gateway` service files (new directory at repo root).
3. Update [package.json](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/package.json) to include `@ai-sdk/mcp`.
4. Add frontend MCP client utility and server feature flag file.
5. Update [route.ts](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/agents/[agentId]/chat/route.ts) to attach MCP tools to `streamText`.
6. Update [feature-flags.ts](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/lib/feature-flags.ts) or add server-only flag module for MCP runtime toggle.

### Public Interfaces / Config Additions
1. New env vars:
- `HELIOSCTA_PG_MCP_URI` (local Claude wrapper)
- `MCP_POSTGRES_GATEWAY_URL` (frontend server runtime)
- `MCP_POSTGRES_GATEWAY_API_KEY` (frontend server runtime + gateway)
- `AGENT_MCP_POSTGRES_ENABLED` (server-side feature flag)
2. New MCP endpoint:
- `POST /mcp` on sidecar gateway (authenticated)
3. New tool contracts:
- `query`, `list_tables`, `describe_table` response payloads include `rowCount`, `truncated`, and structured error fields.

### Test Cases and Scenarios
1. Claude MCP local:
- `claude mcp list` includes `postgres`.
- Claude prompt “run `SELECT current_date`” succeeds.
- Claude prompt with `DROP TABLE` is rejected.
2. Gateway health:
- Unauthorized request to `/mcp` returns 401.
- Authorized MCP `tools/list` succeeds.
3. Frontend chat integration:
- In Workbench, user asks “What tables are in gas_ebbs?” and agent uses tool instead of asking user to paste data.
- User asks to run a read-only query; result is returned with truncation indicator when large.
- Non-read-only SQL request gets blocked and agent explains why.
4. Failure handling:
- Gateway down: chat route falls back cleanly and returns actionable error text.
- Feature flag off: no MCP path invoked.
5. Budget behavior:
- Confirm token/cost logging still works and no regressions in budget guardrail response.

### Rollout and Safety
1. Start with local dev only (`docker-compose` sidecar + feature flag on locally).
2. Validate with real Workbench prompts.
3. Deploy gateway separately from frontend to keep long-lived MCP transport stable.
4. Keep MCP behind auth + network allowlist; never expose public unauthenticated endpoint.
5. Maintain existing SQL guardrails as defense-in-depth.

### Assumptions and Defaults
1. Scope is `project` (chosen).
2. Credential handling uses env var wrapper (chosen), not inline URI in committed config.
3. Runtime transport is HTTP MCP gateway sidecar (chosen), not stdio in Next route.
4. Gateway is read-only and row-limited by default.
5. Existing direct SQL execution path remains available as fallback during rollout.
