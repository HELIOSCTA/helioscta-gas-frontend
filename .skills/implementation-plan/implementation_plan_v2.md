# Helios Shared Analysis Workspace - Implementation Plan v2

## Summary
Build a secure, unified split-view workbench for analyst-assisted daily gas-market reporting, using workspace files (`prompt.md`, `analysis.md`, SQL scripts, report assets), governed read-only SQL execution across Azure SQL + Azure PostgreSQL, agent-assisted narrative drafting, and deterministic report generation with run history, evidence traceability, and publish workflow.

## 1. Goals
1. Support AGT-style folder workflows as first-class objects in-app.
2. Let analysts run repeatable daily analysis jobs with transparent step status.
3. Combine file workspace + SQL execution + agent drafting + report preview in one screen.
4. Enforce production-grade auth, authorization, and auditability.
5. Preserve flexibility for other pipeline/market analysis packs beyond AGT.

## 2. Non-Goals (v2)
1. Fully autonomous no-human publish.
2. Real-time multi-cursor collaborative editing.
3. Write-capable SQL execution.
4. Full file version-control UI (latest-only remains default).

## 3. Locked Product Decisions
1. Runtime split: Next.js API owns orchestration; FastAPI only for specialized compute (plot generation).
2. Collaboration model: async shared collaboration.
3. Access model: org-shared authenticated users.
4. SQL policy: read-only guardrailed SQL only.
5. SQL targets: both Azure SQL and Azure PostgreSQL.
6. UX shape: unified split-view workbench.
7. Report mode: analyst-assisted (draft + review + final publish).

## 4. Core User Journeys
1. Analyst opens an Analysis Pack (example: `agt_pipe_balance`) and sees prompt, SQL scripts, prior reports, and run history.
2. Analyst starts daily run for a specific gas day/trade date.
3. System executes step pipeline and surfaces status/errors by step.
4. Analyst reviews generated datasets, charts, draft markdown, and HTML report.
5. Analyst edits markdown/SQL if needed, reruns selected steps, and publishes final report.
6. Team can reopen past runs and trace each narrative claim to data evidence.

## 5. Domain Model
1. `Workspace`: shared file container (existing).
2. `AnalysisPack`: reusable analysis definition tied to a workspace folder pattern.
3. `PackInput`: declared required inputs (SQL files, prompt, map JSON, reference report).
4. `PackRun`: dated execution instance with lifecycle status.
5. `PackRunStep`: per-step execution record and logs.
6. `SqlRun`: each SQL execution record with dialect, timing, limits, actor.
7. `ReportArtifact`: generated markdown/html/json outputs for a run.
8. `EvidenceLink`: mapping from report sections/claims to SQL run IDs and source files.

## 6. Database Changes
1. Keep `helioscta_agents.workspaces` and `helioscta_agents.workspace_files`.
2. Add `helioscta_agents.analysis_packs` with `pack_id`, `workspace_id`, `slug`, `display_name`, `description`, `is_active`, `created_by`, timestamps.
3. Add `helioscta_agents.analysis_pack_inputs` with `input_id`, `pack_id`, `input_type`, `file_path`, `required`, `dialect`, timestamps.
4. Add `helioscta_agents.pack_runs` with `run_id`, `pack_id`, `run_date`, `trade_date`, `status`, `started_by`, `started_at`, `completed_at`, `error_summary`.
5. Add `helioscta_agents.pack_run_steps` with `step_id`, `run_id`, `step_name`, `status`, `started_at`, `completed_at`, `log_text`, `output_json`.
6. Add `helioscta_agents.sql_runs` with `sql_run_id`, `run_id`, `workspace_id`, `dialect`, `sql_text`, `executed_by`, `status`, `row_count`, `elapsed_ms`, `truncated`, `error_text`, `created_at`.
7. Add `helioscta_agents.report_artifacts` with `artifact_id`, `run_id`, `artifact_type`, `workspace_file_id`, `blob_path`, `generated_by`, `created_at`.
8. Add `helioscta_agents.evidence_links` with `evidence_id`, `run_id`, `section_key`, `claim_text`, `sql_run_id`, `workspace_file_id`, `created_at`.
9. Add indexes: `pack_runs(pack_id, run_date desc)`, `pack_run_steps(run_id, step_name)`, `sql_runs(run_id, created_at desc)`, `evidence_links(run_id, section_key)`.

## 7. Public API / Interface Changes

### 7.1 Pack Management
1. `GET /api/analysis-packs` returns list of packs user can access.
2. `POST /api/analysis-packs` creates pack tied to workspace + initial inputs.
3. `GET /api/analysis-packs/:packId` returns pack metadata, required inputs, latest runs.
4. `PATCH /api/analysis-packs/:packId` updates metadata and input declarations.

### 7.2 Run Orchestration
1. `POST /api/analysis-packs/:packId/runs` starts a run with `{ runDate, tradeDate, options }`.
2. `GET /api/analysis-runs/:runId` returns summary + step statuses.
3. `POST /api/analysis-runs/:runId/retry-step` retries a failed or stale step.
4. `POST /api/analysis-runs/:runId/finalize` marks run as reviewed/final.

### 7.3 SQL Execution
1. `POST /api/sql/execute` request `{ runId, workspaceId, dialect, sqlText, fileId?, maxRows?, timeoutMs? }`.
2. `POST /api/sql/validate` request `{ dialect, sqlText }` returns rule pass/fail reasons.
3. `GET /api/workspaces/:workspaceId/sql-runs?runId=&limit=` returns SQL history.

### 7.4 Report Artifacts
1. `POST /api/analysis-runs/:runId/generate-report` creates markdown + html artifacts.
2. `GET /api/analysis-runs/:runId/artifacts` returns output file pointers.
3. `GET /api/analysis-runs/:runId/evidence` returns claim-to-source mappings.

### 7.5 Agent Chat Extension
1. Extend `POST /api/agents/:agentId/chat` body with `workspaceContext: { workspaceId, fileIds, runId?, sectionKey? }`.
2. Persist `user_email` from session on user and assistant message writes.
3. Add optional `saveToRunArtifact` flag for section drafts generated by agent.

## 8. Frontend v2 Workbench Design
1. Route: `/workbench/:workspaceId` as primary entrypoint.
2. Left panel: workspace selector, pack selector, file tree, run history list.
3. Center panel: tabs for Editor, Data Preview, SQL Results, Report Preview, Evidence.
4. Right panel: agent chat with context chips (selected files + current run references).
5. Top run bar: run date, trade date, start run, rerun step, finalize report.
6. Step timeline widget: status badges for `load_inputs`, `execute_sql`, `compute_metrics`, `draft_markdown`, `render_report`, `evidence_link`.
7. Report mode: side-by-side markdown editor and live HTML preview.
8. Comparison mode: “today vs prior run” deltas on key metrics and key text changes.

## 9. Analysis Pack Workflow (AGT Example)
1. Required files:
2. `prompt.md` for analyst intent + teammate roles.
3. `analysis.md` as working narrative target.
4. `sql/agt_noms.sql` (Azure SQL).
5. `sql/ice_cash_and_balmo.sql` (Azure PostgreSQL).
6. `reports/algonquin_gas_transmission.json` (map/metadata).
7. Optional reference report: prior `.mhtml` or `.html`.
8. Step 1 `load_inputs`: validate file presence and parse declared assets.
9. Step 2 `execute_sql`: run each SQL script with read-only validator and capture outputs.
10. Step 3 `compute_metrics`: produce standardized derived metrics and day-over-day deltas.
11. Step 4 `draft_markdown`: call agent with curated context and section template.
12. Step 5 `render_report`: produce deterministic HTML from markdown + chart data.
13. Step 6 `evidence_link`: map each major claim block to SQL run IDs and source files.
14. Step 7 `review_finalize`: analyst approves and marks run final.

## 10. Report Generation Specification
1. Output files per run:
2. `analysis_YYYY-MM-DD.md`
3. `report_YYYY-MM-DD.html`
4. `report_data_YYYY-MM-DD.json`
5. Render engine: deterministic server-side template for HTML report shell.
6. Charts: generated from run JSON data using fixed chart specs.
7. Mandatory report sections:
8. Executive summary.
9. Physical balance analysis.
10. Price/basis analysis.
11. Correlation and key signals.
12. Risks and next-day watchlist.
13. Evidence appendix.
14. Publish states: `draft`, `reviewed`, `final`.
15. Final publish writes artifact metadata and immutable timestamp.

## 11. Security and Authorization Hardening
1. Enforce auth on all `/api/workspaces/*`, `/api/agents/*`, `/api/sql/*`, `/api/analysis-*`.
2. Replace middleware exemption model with explicit API auth checks.
3. Add object scoping checks:
4. `workspaceId` must own `fileId`.
5. `agentId` must own `conversationId`.
6. `runId` must belong to requested `packId`.
7. Use parameterized SQL only in backend services.
8. Read-only SQL validator rejects DDL/DML and multi-statement unsafe patterns.
9. Add statement timeout, row cap, result payload cap, and execution logging.
10. Persist actor identity on all mutating actions and SQL runs.

## 12. Reliability and Observability
1. Structured logs with `requestId`, `runId`, `stepId`, `workspaceId`, `userEmail`.
2. Step-level retries with capped retry counts.
3. Explicit stale-data checks before run start.
4. Health checks for both DB connections and blob access.
5. Metrics: run success rate, step failure rate, SQL latency, chat latency, report generation latency.

## 13. Implementation Phases

### Phase A - Blocking Security + Correctness
1. API auth enforcement.
2. Object-level authorization checks.
3. Fix autosave race in file editor flow.
4. Move render-time side effects to hooks.
5. Patch SQL-injection-prone backend query paths.

### Phase B - Analysis Pack + Run Engine
1. Add analysis pack and run tables + APIs.
2. Implement step orchestrator and run timeline.
3. Add SQL validator and SQL execute service for both dialects.

### Phase C - Unified Workbench UI
1. Build split-view workbench page and state model.
2. Add run controls, step status, and SQL results panel.
3. Add report preview/editor and artifact browsing.

### Phase D - Agent + Evidence Integration
1. Add file/run context chips to agent prompts.
2. Add section-focused draft generation.
3. Persist evidence links for major claims.

### Phase E - Finalization + Rollout
1. Feature flags for staged release.
2. Runbook and documentation.
3. Production readiness checks and post-release monitoring.

## 14. Test Plan

### 14.1 Unit Tests
1. SQL validator acceptance/rejection matrix.
2. Prompt context assembly and truncation behavior.
3. Derived metric and delta calculators.
4. Report template rendering with deterministic fixtures.

### 14.2 Integration Tests
1. Auth required on protected APIs.
2. Resource scoping checks for all ID pairs.
3. SQL execution across both dialects with caps/timeouts.
4. Run orchestration step transitions and retry behavior.

### 14.3 End-to-End Scenarios
1. AGT pack full run from prompt + SQL + report generation.
2. Manual edit + rerun single step + finalize publish.
3. Failure injection for stale source data and SQL runtime errors.
4. Reopen previous run and verify evidence traceability.

## 15. Acceptance Criteria
1. Analyst can reproduce AGT-style daily report entirely in-app from pack files.
2. Unified split-view replaces fragmented workflow for core analysis tasks.
3. SQL runner works read-only against Azure SQL and Azure PostgreSQL with guardrails.
4. Each final report has linked evidence to queries and source files.
5. Critical security gaps (auth and scoping) are closed.
6. Lint/build pass and automated tests cover critical path.

## 16. Rollout Strategy
1. Feature flags:
2. `WORKBENCH_V2_ENABLED`
3. `ANALYSIS_PACKS_ENABLED`
4. `SQL_RUNNER_ENABLED`
5. `EVIDENCE_LINKS_ENABLED`
6. Internal alpha with AGT pack first.
7. Expand to second pack after 1 week of stable metrics.
8. Remove legacy split navigation after migration window.

## 17. Migration and Backfill
1. Add missing baseline migrations for `agents`, `conversations`, `messages` in-repo.
2. Apply new v2 migrations in strict order.
3. Backfill one sample `analysis_pack` from `.prompts/agt_pipe_balance`.
4. Seed initial run templates and required input declarations.

## 18. Assumptions and Defaults
1. Org users are trusted collaborators under authenticated access.
2. Daily reporting remains analyst-assisted for final publish.
3. Latest-only file model is acceptable in v2.
4. Existing blob container and DB credentials are available in all environments.
5. FastAPI plotting endpoint remains available and proxied by Next API.
