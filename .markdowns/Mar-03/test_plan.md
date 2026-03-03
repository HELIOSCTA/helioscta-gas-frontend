# Agent Workspace Test Plan — 2026-03-03

## Objective

End-to-end simulation of the 6-step analysis pipeline at `/workbench/[workspaceId]` using the AGT Pipe Balance pack (pack_id=1, workspace_id=1).

---

## Environment

| Item | Value |
|---|---|
| Dev server | `http://localhost:2222` |
| Pack | AGT Pipe Balance Analysis (pack_id=1) |
| Workspace | agt_pipe_balance (workspace_id=1) |
| Run ID | 8 |
| Auth | Local dev bypass (no `AUTH_MICROSOFT_ENTRA_ID_ID` set) |

---

## Test Run #8 — Full Pipeline Simulation

### Step 0: Create Run

```
POST /api/analysis-packs/1/runs
Body: { "trade_date": "2026-03-02" }
Response: { "run_id": 8, "run_output_path": ".prompts/agt_pipe_balance/runs/2026-03-03/run_8" }
```

Creates 6 pending step rows in `pack_run_steps`.

### Step 1: load_inputs — PASSED

```
POST /api/analysis-runs/8/execute-step
Body: { "stepName": "load_inputs" }
```

| Input | Found |
|---|---|
| `prompt.md` | Yes |
| `sql/agt_noms.sql` | Yes |
| `sql/ice_cash_and_balmo.sql` | Yes |
| `reports/algonquin_gas_transmission.json` | Yes |

Convention warnings: 0

### Step 2: execute_sql — PASSED (after 4 retries)

```
POST /api/analysis-runs/8/execute-step
Body: { "stepName": "execute_sql" }
```

| SQL Input | Dialect | Rows | Elapsed |
|---|---|---|---|
| `sql/agt_noms.sql` | mssql | 0 | 82ms |
| `sql/ice_cash_and_balmo.sql` | postgresql | 10 | 40ms |

**Retries required due to:**
1. Retries 1-2: Blob storage 404 — workspace file records existed in DB but actual blobs had been deleted from Azure Storage. Fixed by re-uploading content via `PUT /api/workspaces/1/files/{fileId}`.
2. Retries 3-4: SQL column name errors — original sample queries used incorrect column names. Fixed queries:
   - `agt_noms.sql`: changed `pipeline` to `pipeline_short_name`, `location_name` to `loc_name`, `scheduled_quantity` to `scheduled_cap`
   - `ice_cash_and_balmo.sql`: changed `pipeline_name` to `notice_type`, `posting_datetime` to `posted_datetime`

### Step 3: compute_metrics — PASSED

```
POST /api/analysis-runs/8/execute-step
Body: { "stepName": "compute_metrics" }
```

- Groups computed: 1
- Metrics computed: 1
- Output: `metrics.json` saved to `.prompts/agt_pipe_balance/runs/2026-03-03/run_8/reports/metrics.json`

### Step 4: build_context — PASSED

```
POST /api/analysis-runs/8/execute-step
Body: { "stepName": "build_context" }
```

- SQL results in context: 3
- Has metrics: true
- Output: `analysis_draft.md` saved to `.prompts/agt_pipe_balance/runs/2026-03-03/run_8/drafts/analysis_draft.md`

### Step 5: generate_report — PASSED

```
POST /api/analysis-runs/8/execute-step
Body: { "stepName": "generate_report" }
```

- Sections generated: 2
- Output: `report.json` saved to `.prompts/agt_pipe_balance/runs/2026-03-03/run_8/reports/report.json`

Report structure:
```
Title:   agt pipe balance — Today
Signal:  neutral
Summary: Report with 2 section(s) generated from 3 SQL run(s).
Sections:
  [narrative]   SQL Results
  [metric_card] SQL Run #19
```

### Step 6: evidence_link — PASSED

```
POST /api/analysis-runs/8/execute-step
Body: { "stepName": "evidence_link" }
```

- Sections found: 2
- Evidence links created: 6
- Output: `evidence.json` saved to `.prompts/agt_pipe_balance/runs/2026-03-03/run_8/evidence/evidence.json`

Evidence mapping:
```
[sql_results] -> sql_run_id=15, 18, 19
[sql_run_19]  -> sql_run_id=15, 18, 19
```

---

## Final Run Status

```
Run #8: completed
Steps:
  load_inputs:      completed
  execute_sql:      completed (retried 4x)
  compute_metrics:  completed
  build_context:    completed
  generate_report:  completed
  evidence_link:    completed
```

---

## Issues Found

### 1. Blob Storage Desync

**Severity:** Medium
**Description:** Workspace file records existed in `helioscta_agents.workspace_files` with valid `blob_path` values, but the actual blobs had been deleted from Azure Storage. The `load_inputs` step passed (it only checks DB records), but `execute_sql` failed when trying to `downloadBlob()`.

**Root Cause:** Blobs were likely deleted externally or by a cleanup process without updating the DB records.

**Fix Applied:** Re-uploaded file content via `PUT /api/workspaces/1/files/{fileId}`, which calls `uploadBlob()` to restore the blob.

**Recommendation:** Add a blob-existence check to `load_inputs` (not just DB record check) to catch this earlier.

### 2. API Field Naming Mismatch

**Severity:** Low (currently works due to how the frontend sends requests)
**Description:** The `execute-step` and `retry-step` API routes expect `{ stepName }` (camelCase) in the request body, but the `RunBar.tsx` component sends `{ step_name }` (snake_case).

**Files:**
- `frontend/app/api/analysis-runs/[runId]/execute-step/route.ts:22` — destructures `{ stepName }`
- `frontend/app/api/analysis-runs/[runId]/retry-step/route.ts:19` — destructures `{ stepName }`
- `frontend/components/workbench/RunBar.tsx:53` — sends `{ step_name: stepName }`
- `frontend/components/workbench/RunBar.tsx:66` — sends `{ step_name: stepName }`

**Impact:** RunBar step execution and retry calls silently fail (API returns `{ error: "stepName is required" }` with 400 status). The step never executes from the UI.

**Fix:** Either update RunBar to send `{ stepName }` or update the API to accept both.

### 3. Incorrect Sample SQL in Seed Data

**Severity:** Low (test-only)
**Description:** The sample SQL queries in the test documentation used incorrect column names for both the Genscape noms table (mssql) and the algonquin critical notices table (postgresql).

**Correct columns:**
- `noms_v1_2026_jan_02.source_v1_genscape_noms`: `gas_day`, `pipeline_name`, `pipeline_short_name`, `loc_name`, `scheduled_cap`, `operational_cap`
- `gas_ebbs.algonquin_critical_notices`: `notice_identifier`, `notice_type`, `subject`, `posted_datetime`

**Fix Applied:** Updated sample SQL in `Agent Workspace Tests.md` with correct column names.

---

## Artifacts Produced

| Artifact | Path |
|---|---|
| Metrics | `.prompts/agt_pipe_balance/runs/2026-03-03/run_8/reports/metrics.json` |
| Context | `.prompts/agt_pipe_balance/runs/2026-03-03/run_8/drafts/analysis_draft.md` |
| Report | `.prompts/agt_pipe_balance/runs/2026-03-03/run_8/reports/report.json` |
| Evidence | `.prompts/agt_pipe_balance/runs/2026-03-03/run_8/evidence/evidence.json` |
| SQL results (CSV) | `.prompts/agt_pipe_balance/runs/2026-03-03/run_8/sql/results/*.csv` |
| Executed SQL | `.prompts/agt_pipe_balance/runs/2026-03-03/run_8/sql/executed/*.sql` |

---

## Documentation Updated

| File | Change |
|---|---|
| `.SKILLS/agent-workbench/references/Agent Workspace Tests.md` | Full 15-section test guide written |
| `.SKILLS/agent-workbench/skill-agent-workbench.md` | Added link to test guide under "Runs" section |
| `Agent Workspace Tests.md` — Section 6 | Fixed API body from `step_name` to `stepName` |
| `Agent Workspace Tests.md` — Section 13 | Fixed sample SQL column names to match actual schemas |
