 Step 1: Wire activeRunId into chat context (quick win)

 Files:
 - frontend/app/workbench/[workspaceId]/WorkbenchClient.tsx — pass activeRunId prop to <WorkbenchChat>
 - frontend/components/workbench/WorkbenchChat.tsx — accept activeRunId prop, include as runId in workspaceContext

 This activates the existing dead code in chat/route.ts lines 140-166 that injects SQL results from pack runs.

 Step 2: Inject workspace file manifest into agent context

 Files:
 - frontend/app/workbench/[workspaceId]/WorkbenchClient.tsx — pass allFiles (name, type, parentPath, fileId) to WorkbenchChat
 - frontend/components/workbench/WorkbenchChat.tsx — accept allFiles prop, send as workspaceContext.fileManifest
 - frontend/app/api/agents/[agentId]/chat/route.ts — after file content loading (line 137), build a <workspace_files> block from the manifest listing all files by folder. Prepend to contextParts. ~200 tokens.

 The agent will now see: "Files available in this workspace: datasets/agt_noms.sql, datasets/ice_pricing.sql, ..."

 Step 3: Add agent tool-use (SQL execution, table discovery, file reading)

 Files:
 - frontend/app/api/agents/[agentId]/chat/route.ts — define 3 tools inline (closures capture workspaceId, userEmail):
   - execute_sql — calls existing executeSql() from lib/sql-executor.ts (already validates read-only). Returns up to 20 rows. Logs to sql_runs.
   - list_tables — queries information_schema.tables for gas_ebbs and helioscta_agents schemas. Returns table names + column counts.
   - read_file — downloads a workspace file by fileId from Azure Blob. Capped at 900 tokens.
 - Add tools: agentTools, toolChoice: "auto" to the streamText() call
 - Use maxSteps: 3 to allow up to 3 tool-use rounds before final text
 - toTextStreamResponse() still works — SDK runs tools server-side and streams final text only

 Token budget analysis: Worst case 3 tool calls = ~3600 extra input tokens. Total per turn ~9600 tokens at $3/M = ~$0.03. Within $0.05/turn budget.

 Safety: All SQL goes through validateReadOnlySql() which blocks DDL/DML/DCL. Consider restricting execute_sql tool to gas_ebbs schema only.

 Step 4: Update agent system prompt

 New migration: backend/migrations/010_update_agent_prompt.sql

 Add to system_prompt:
 - Workspace awareness: reference <workspace_files> manifest, <file> tags, <sql_result> tags
 - Tool instructions: use execute_sql to run queries, list_tables to discover schemas, read_file for workspace files
 - Behavior: when user says "run these queries" or "find data", use tools autonomously

 Step 5: Wire DatasetCatalog into left panel

 File: frontend/app/workbench/[workspaceId]/WorkbenchClient.tsx
 - Add Files/Data Catalog tab toggle in left panel
 - Import and render DatasetCatalog component
 - Wire onInjectContext to push schema info into chat context

 Step 6: Add feature flag

 File: frontend/lib/feature-flags.ts
 - Add AGENT_TOOL_USE_ENABLED (default true)
 - Gate tool definitions in chat route behind this flag

 Critical Files

 ┌──────────────────────────────────────────────────────────┬───────────────────────────────────────────────────────────────┐
 │                           File                           │                            Changes                            │
 ├──────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
 │ frontend/app/api/agents/[agentId]/chat/route.ts          │ File manifest injection, tool definitions, runId handling     │
 ├──────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
 │ frontend/components/workbench/WorkbenchChat.tsx          │ Accept activeRunId + allFiles props, pass in workspaceContext │
 ├──────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
 │ frontend/app/workbench/[workspaceId]/WorkbenchClient.tsx │ Pass new props, integrate DatasetCatalog                      │
 ├──────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
 │ frontend/lib/sql-executor.ts                             │ No changes (reused by tool)                                   │
 ├──────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
 │ frontend/lib/sql-validator.ts                            │ No changes (reused by tool)                                   │
 ├──────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
 │ frontend/lib/feature-flags.ts                            │ Add AGENT_TOOL_USE_ENABLED                                    │
 ├──────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
 │ backend/migrations/010_update_agent_prompt.sql           │ New migration for updated system prompt                       │
 ├──────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
 │ frontend/components/workbench/DatasetCatalog.tsx         │ No changes (already built, just needs wiring)                 │
 └──────────────────────────────────────────────────────────┴───────────────────────────────────────────────────────────────┘

 Verification

 1. Start dev server: cd frontend && npm run dev
 2. Open workbench at /workbench/{workspaceId}
 3. Upload a .sql file to the datasets/ folder
 4. Open agent chat, type "What files are in my workspace?" -> Should list files from manifest
 5. Type "Run the SQL in datasets/agt_noms.sql" -> Agent should use read_file tool to read the SQL, then execute_sql to run it, then analyze results
 6. Type "What tables are available?" -> Agent should use list_tables tool
 7. Start a pack run, then ask about results -> SQL results should appear in context via runId
 8. Check Data Catalog tab in left panel -> Should show table browser
 9. Verify budget: check helioscta_agents.messages for estimated_cost_usd staying under $0.05/turn