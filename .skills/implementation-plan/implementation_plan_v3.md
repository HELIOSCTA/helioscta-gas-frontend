# Helios Shared Analysis Workspace - Implementation Plan v3 (Stability-First)

## Summary
This v3 plan prioritizes hardening and correctness before new feature expansion. It keeps Next.js API as the orchestration layer, keeps FastAPI limited to specialized compute (plot generation), and keeps org-wide authenticated sharing while enforcing strict object-scoping between IDs (workspace, pack, run, agent, conversation, file). The plan closes current security and reliability gaps, makes run orchestration deterministic, improves workbench chat/session behavior, and formalizes cost accounting with a dedicated ledger.

## Locked Decisions
1. Priority: stability and security first.
2. Runtime split: Next.js API remains primary orchestrator; FastAPI stays compute-only.
3. Access model: org-wide shared access remains, but all scoped endpoints enforce ID relationship checks.
4. SQL execution remains read-only with hard caps and stronger validation.
5. Workbench is the primary UX for analysis packs; legacy workspace view becomes secondary during migration.

## Current-State Findings From Scan
1. Object scoping gap exists in conversation messages API: [`frontend/app/api/agents/[agentId]/conversations/[conversationId]/messages/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/agents/[agentId]/conversations/[conversationId]/messages/route.ts).
2. Workbench chat creates a new conversation per send and does not persist session context per workspace/run: [`frontend/components/workbench/WorkbenchChat.tsx`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/components/workbench/WorkbenchChat.tsx).
3. Run pipeline still has placeholder behavior for metrics/report generation paths: [`frontend/lib/run-orchestrator.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/lib/run-orchestrator.ts), [`frontend/app/api/analysis-runs/[runId]/generate-report/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/analysis-runs/[runId]/generate-report/route.ts).
4. SQL validator is regex-based and executor does not fully enforce timeout/payload limits: [`frontend/lib/sql-validator.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/lib/sql-validator.ts), [`frontend/lib/sql-executor.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/lib/sql-executor.ts).
5. Workbench editor save path is still prone to stale writes vs file switching compared to legacy workspace safeguards: [`frontend/app/workbench/[workspaceId]/WorkbenchClient.tsx`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/workbench/[workspaceId]/WorkbenchClient.tsx), [`frontend/components/workspace/FileEditor.tsx`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/components/workspace/FileEditor.tsx).
6. FastAPI CORS is fully open and endpoint surface is broader than required for compute-only role: [`backend/src/api.py`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/backend/src/api.py).
7. Cost tracking currently piggybacks on messages table, which is not a request-level ledger: [`backend/migrations/006_token_cost_tracking.sql`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/backend/migrations/006_token_cost_tracking.sql), [`frontend/lib/token-budget.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/lib/token-budget.ts).

## v3 Scope
1. Close security/scoping/correctness gaps across existing API surface.
2. Make run execution deterministic, idempotent, and observable.
3. Improve workbench usability for daily AGT-style workflows.
4. Reduce token spend volatility with enforceable budget controls and auditable cost records.
5. Add production-grade tests, docs, and rollout controls.

## Implementation Phases

## Phase 1 - Security and Scoping Hardening
1. Add shared scoping helpers in a new module and use them across all scoped APIs.
2. Enforce agent-conversation scope in messages API; return `404` on mismatched pairs to avoid enumeration.
3. Enforce workspace scope checks on file, SQL-run, and analysis-run/artifact/evidence APIs.
4. Enforce run-pack-workspace relationship checks on run endpoints before execution/finalization/retry.
5. Normalize request validation with schema parsing for all mutating endpoints.
6. Restrict backend CORS to configured allowed origins and methods.

### Phase 1 file targets
1. [`frontend/lib/auth-guard.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/lib/auth-guard.ts) (retain auth entrypoint).
2. New [`frontend/lib/resource-scope.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/lib/resource-scope.ts).
3. [`frontend/app/api/agents/[agentId]/conversations/[conversationId]/messages/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/agents/[agentId]/conversations/[conversationId]/messages/route.ts).
4. [`frontend/app/api/workspaces/[workspaceId]/files/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/workspaces/[workspaceId]/files/route.ts).
5. [`frontend/app/api/workspaces/[workspaceId]/files/[fileId]/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/workspaces/[workspaceId]/files/[fileId]/route.ts).
6. [`frontend/app/api/workspaces/[workspaceId]/sql-runs/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/workspaces/[workspaceId]/sql-runs/route.ts).
7. [`frontend/app/api/analysis-packs/[packId]/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/analysis-packs/[packId]/route.ts).
8. [`frontend/app/api/analysis-packs/[packId]/runs/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/analysis-packs/[packId]/runs/route.ts).
9. [`frontend/app/api/analysis-runs/[runId]/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/analysis-runs/[runId]/route.ts).
10. [`frontend/app/api/analysis-runs/[runId]/execute-step/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/analysis-runs/[runId]/execute-step/route.ts).
11. [`frontend/app/api/analysis-runs/[runId]/retry-step/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/analysis-runs/[runId]/retry-step/route.ts).
12. [`frontend/app/api/analysis-runs/[runId]/finalize/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/analysis-runs/[runId]/finalize/route.ts).
13. [`frontend/app/api/analysis-runs/[runId]/artifacts/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/analysis-runs/[runId]/artifacts/route.ts).
14. [`frontend/app/api/analysis-runs/[runId]/evidence/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/analysis-runs/[runId]/evidence/route.ts).
15. [`backend/src/api.py`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/backend/src/api.py).

## Phase 2 - SQL Safety and Cost Controls
1. Upgrade SQL validation to lexical pass plus statement-shape checks that handle comments/strings/CTEs more safely.
2. Enforce hard limits in executor: `maxRows`, `maxBytes`, `timeoutMs`, SQL length cap, and deterministic truncation metadata.
3. Return `sqlRunId` on `/api/sql/execute` for traceability and immediate UI linking.
4. Add dedicated LLM request ledger table for estimated and actual spend per request.
5. Move budget checks to ledger-based aggregation; keep message-level cost fields for display compatibility.
6. Expand cost stats endpoint to support daily, model, and workspace dimensions.

### Phase 2 file targets
1. [`frontend/lib/sql-validator.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/lib/sql-validator.ts).
2. [`frontend/lib/sql-executor.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/lib/sql-executor.ts).
3. [`frontend/lib/mssql.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/lib/mssql.ts).
4. [`frontend/app/api/sql/execute/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/sql/execute/route.ts).
5. [`frontend/app/api/sql/validate/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/sql/validate/route.ts).
6. [`frontend/app/api/agents/[agentId]/chat/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/agents/[agentId]/chat/route.ts).
7. [`frontend/app/api/agents/cost-stats/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/agents/cost-stats/route.ts).
8. [`frontend/lib/token-budget.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/lib/token-budget.ts).
9. [`frontend/lib/token-costs.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/lib/token-costs.ts).

## Phase 3 - Deterministic Run Engine and Artifacts
1. Enforce step dependency graph and prevent out-of-order execution.
2. Add run-level lock to avoid concurrent step races.
3. Make step execution idempotent with explicit `force` override.
4. Replace pass-through `compute_metrics` with deterministic metric outputs saved to `report_data_YYYY-MM-DD.json`.
5. Replace placeholder report route with deterministic markdown-to-HTML pipeline and stable section template.
6. Improve evidence linking to section-level claims with bounded claim text and SQL run mapping policy.
7. Add run event logs endpoint for timeline debugging.

### Phase 3 file targets
1. [`frontend/lib/run-orchestrator.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/lib/run-orchestrator.ts).
2. [`frontend/lib/types/analysis.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/lib/types/analysis.ts).
3. [`frontend/app/api/analysis-runs/[runId]/execute-step/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/analysis-runs/[runId]/execute-step/route.ts).
4. [`frontend/app/api/analysis-runs/[runId]/generate-report/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/analysis-runs/[runId]/generate-report/route.ts).
5. [`frontend/app/api/analysis-runs/[runId]/artifacts/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/analysis-runs/[runId]/artifacts/route.ts).
6. [`frontend/app/api/analysis-runs/[runId]/evidence/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/analysis-runs/[runId]/evidence/route.ts).

## Phase 4 - Workbench UX and Session Reliability
1. Persist one active conversation per `(workspaceId, runId, agentId)` session instead of creating a new conversation every send.
2. Add server endpoint to fetch/create that workbench chat session.
3. Load prior messages when opening workbench run and keep context chips synchronized with selected files.
4. Add save-guard protocol for file edits using `expectedRevision` to prevent stale overwrites.
5. Add explicit save state UI (`idle`, `saving`, `saved`, `conflict`, `error`) in workbench editor.
6. Keep legacy `WorkspaceExplorer` operational but mark as secondary in UI copy once workbench parity is reached.

### Phase 4 file targets
1. [`frontend/components/workbench/WorkbenchChat.tsx`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/components/workbench/WorkbenchChat.tsx).
2. [`frontend/app/workbench/[workspaceId]/WorkbenchClient.tsx`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/workbench/[workspaceId]/WorkbenchClient.tsx).
3. [`frontend/components/workspace/FileEditor.tsx`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/components/workspace/FileEditor.tsx).
4. [`frontend/app/api/workspaces/[workspaceId]/files/[fileId]/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/workspaces/[workspaceId]/files/[fileId]/route.ts).
5. New [`frontend/app/api/workbench/[workspaceId]/chat-session/route.ts`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/app/api/workbench/[workspaceId]/chat-session/route.ts).

## Phase 5 - Backend Surface Cleanup, Observability, and Docs
1. Keep only compute-specialized FastAPI endpoints as public from frontend proxy path; treat other backend data APIs as legacy.
2. Add structured request logging with correlation IDs on Next API and FastAPI.
3. Expand health checks to verify Azure Blob + PostgreSQL + Azure SQL connectivity.
4. Add repo-level docs for local setup, env vars, migration order, and workbench operation.
5. Add CI quality gates for lint, type-check, unit, and API tests.

### Phase 5 file targets
1. [`backend/src/api.py`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/backend/src/api.py).
2. [`backend/src/utils/azure_postgresql.py`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/backend/src/utils/azure_postgresql.py).
3. [`README.md`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/README.md).
4. [`docker-compose.yml`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/docker-compose.yml).
5. [`frontend/package.json`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/frontend/package.json).

## Database Migration Plan (v3)
1. Add `007_security_constraints.sql` with `CHECK` constraints for statuses/dialects, unique `(run_id, step_name)`, and missing foreign keys where safe.
2. Add `008_workbench_sessions.sql` creating `helioscta_agents.workbench_sessions(session_id, workspace_id, run_id, agent_id, conversation_id, created_by, updated_by, created_at, updated_at)` with unique `(workspace_id, COALESCE(run_id,0), agent_id)`.
3. Add `009_llm_request_ledger.sql` creating `helioscta_agents.llm_request_events` with request-level token/cost fields and allow/block status.
4. Add `010_workspace_file_revision.sql` adding `revision_no` and `updated_by` to `workspace_files` for optimistic concurrency.
5. Update seed migration strategy only if required for AGT defaults; do not alter existing historical runs.

### Migration file targets
1. New [`backend/migrations/007_security_constraints.sql`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/backend/migrations/007_security_constraints.sql).
2. New [`backend/migrations/008_workbench_sessions.sql`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/backend/migrations/008_workbench_sessions.sql).
3. New [`backend/migrations/009_llm_request_ledger.sql`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/backend/migrations/009_llm_request_ledger.sql).
4. New [`backend/migrations/010_workspace_file_revision.sql`](C:/Users/AidanKeaveny/Documents/github/helioscta-gas-frontend/backend/migrations/010_workspace_file_revision.sql).

## Public API and Interface Changes
1. `POST /api/sql/execute` request adds enforced bounds and response adds `sqlRunId`.
2. `POST /api/analysis-runs/:runId/execute-step` request adds `force?: boolean`; returns deterministic status and rejects invalid step order with `409`.
3. `POST /api/analysis-runs/:runId/retry-step` request adds `reason` and preserves retry audit.
4. New `GET|POST /api/workbench/:workspaceId/chat-session?runId=&agentId=` for session-backed conversation continuity.
5. `GET /api/agents/:agentId/conversations/:conversationId/messages` enforces agent-conversation relationship.
6. `PUT /api/workspaces/:workspaceId/files/:fileId` requires `expectedRevision`; returns `409` on stale update.
7. `GET /api/agents/cost-stats` uses request ledger and supports `days`, `groupBy`, and optional `workspaceId`.
8. `GET /api/analysis-runs/:runId/logs` (new) returns ordered step and retry event history.

## Type Changes
1. Extend `PackRunStep.output_json` to typed union by `step_name`.
2. Add `PackRunStep.last_error_code` and `last_error_message` fields (derived from logs/output).
3. Add `SqlRun.result_preview` metadata (`rowsReturned`, `rowsStored`, `truncated`, `payloadBytes`).
4. Add `WorkbenchSession` type and `LlmRequestEvent` type in frontend shared types.

## Test Plan

## Unit Tests
1. SQL validator acceptance/rejection matrix including comments, CTEs, quoted strings, and blocked keywords.
2. SQL executor limit behavior for row cap, byte cap, and timeout.
3. Budget guardrail calculations from ledger and boundary conditions.
4. Run orchestrator step dependency and idempotency checks.
5. File revision conflict handling logic.

## API/Integration Tests
1. Agent/conversation/messages scoping mismatch returns `404`.
2. Run execution rejects invalid `runId` or out-of-order step.
3. SQL execute records `sql_run` and returns trace ID even on validation failure.
4. Workbench session endpoint creates and reuses expected conversation.
5. File update with stale revision returns `409`.

## End-to-End Scenarios
1. AGT pack full daily flow: load inputs, execute SQL, compute metrics, draft markdown, render report, evidence link, finalize.
2. Analyst edits markdown, reruns selected step, and confirms artifact update without stale overwrite.
3. Budget limit hit in workbench chat shows actionable error and preserves conversation state.
4. Reopen prior run and verify evidence links and SQL lineage.

## Acceptance Criteria
1. No scoped API returns data for mismatched IDs (workspace/file, agent/conversation, run/pack).
2. Workbench chat no longer creates a new conversation for each message.
3. SQL runner enforces read-only + timeout + payload limits with deterministic metadata.
4. `compute_metrics` and report generation produce repeatable artifacts per run date.
5. Cost dashboards are backed by a dedicated request ledger, not only message rows.
6. Lint/build/test pipelines pass with added coverage for critical path.
7. FastAPI CORS is no longer wildcard in non-local environments.

## Rollout Strategy
1. Release behind existing flags plus new `WORKBENCH_CHAT_SESSION_ENABLED` and `FILE_REVISION_GUARD_ENABLED`.
2. Deploy Phase 1 and Phase 2 first; require one stable week before enabling Phase 3 and Phase 4 in production.
3. Keep legacy workspace UI available during migration and deprecate only after workbench parity checks pass.
4. Monitor run failure rate, SQL timeout rate, message cost per active user, and stale-save conflict rate.

## Assumptions and Defaults
1. Authenticated org-wide sharing remains acceptable for v3; no per-user ACL table is introduced in this phase.
2. Next.js API remains primary orchestrator and DB access layer.
3. FastAPI remains available for plotting and compute-heavy transformations only.
4. Existing Azure credentials and blob container names remain unchanged across environments.
5. Existing migration history remains source of truth; new migrations are additive and backward compatible.
