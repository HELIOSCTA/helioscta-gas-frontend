# Agent Workspace Test Guide

Manual testing and simulation guide for the Analysis Workbench at `/workbench/[workspaceId]`.

---

## 1. Prerequisites

| Requirement | Detail |
|---|---|
| **Dev server** | `cd frontend && npm install && npx next dev -p 2222` |
| **Database** | Azure PostgreSQL with `helioscta_agents` schema migrated |
| **Migrations** | `004_analysis_packs.sql` and `005_seed_agt_pack.sql` applied |
| **Blob storage** | `AZURE_STORAGE_CONNECTION_STRING` and `AZURE_STORAGE_CONTAINER_NAME` set in `frontend/.env.local` |
| **Auth bypass** | Local dev skips auth when `AUTH_MICROSOFT_ENTRA_ID_ID` is **not** set |
| **Azure SQL** | Required only if running SQL inputs with `dialect: 'mssql'` (e.g., AGT noms query) |

### Feature Flags

All flags default to `true` (`frontend/lib/feature-flags.ts`):

| Flag | Controls |
|---|---|
| `NEXT_PUBLIC_WORKBENCH_V2_ENABLED` | Workbench v2 layout |
| `NEXT_PUBLIC_ANALYSIS_PACKS_ENABLED` | PackSelector visibility |
| `NEXT_PUBLIC_SQL_RUNNER_ENABLED` | SqlResultsPanel, SqlEditorToolbar |
| `NEXT_PUBLIC_EVIDENCE_LINKS_ENABLED` | EvidencePanel |
| `NEXT_PUBLIC_WORKSPACE_ONBOARDING_ENABLED` | WorkspaceOnboarding modal |
| `NEXT_PUBLIC_RUN_DIFF_ENABLED` | Run comparison checkboxes in RunHistory |
| `NEXT_PUBLIC_DATASET_DISCOVERY_ENABLED` | DatasetCatalog sidebar |
| `NEXT_PUBLIC_COST_DISPLAY_ENABLED` | CostEstimateBar in chat |
| `NEXT_PUBLIC_TOKEN_GUARDRAILS_ENABLED` | Token budget enforcement |

---

## 2. Quick-Start Walkthrough

```
1. Open  http://localhost:2222/workbench/{workspaceId}
2. Complete onboarding (AGT template recommended)
3. Select pack via PackSelector dropdown
4. Set trade date in RunBar, click "Start Run"
5. Click each step node in StepProgressBar left-to-right
6. When all 6 nodes turn green, switch to Report tab
```

---

## 3. Workspace Setup

### Navigating to the Workbench

URL pattern: `/workbench/{workspaceId}` where `workspaceId` is a numeric ID from `helioscta_agents.workspaces`.

The seed migration creates workspace `agt_pipe_balance` — find its `workspace_id` with:

```sql
SELECT workspace_id FROM helioscta_agents.workspaces WHERE slug = 'agt_pipe_balance';
```

### Onboarding Modal

On first visit (when `WORKSPACE_ONBOARDING_ENABLED` is `true` and the workspace has no files), `WorkspaceOnboarding` displays a template picker:

| Template | Creates | Use Case |
|---|---|---|
| **AGT** | `prompt.md`, `working.md`, `map.json`, `example.sql` | Pre-built AGT Pipe Balance starter |
| **Blank** | `readme.md` | Empty workspace |
| **Import** | (user uploads) | Bring your own files |

Files are created via `POST /api/workspaces/{workspaceId}/files`.

### Uploading Files

Use the FolderExplorer panel (left side) to create or upload files. The workbench saves file content to Azure Blob Storage and records metadata in `helioscta_agents.workspace_files`.

---

## 4. Pack Management

### Creating a Pack

1. Click the **PackSelector** dropdown (top-left, shows "Select Pack")
2. Click **"+ Create Pack"** at the bottom of the dropdown
3. Enter a display name (e.g., "My Test Pack")
4. The slug is auto-generated: `my-test-pack`
5. Pack is created via `POST /api/analysis-packs` with:

```json
{
  "workspace_id": 1,
  "slug": "my-test-pack",
  "display_name": "My Test Pack"
}
```

### Pack Inputs

Each pack declares its expected input files in `helioscta_agents.analysis_pack_inputs`. The AGT seed pack declares 4 inputs:

| `input_type` | `file_path` | `dialect` | `display_label` |
|---|---|---|---|
| `prompt` | `prompt.md` | — | Analysis Prompt |
| `sql` | `sql/agt_noms.sql` | `mssql` | AGT Nominations Query |
| `sql` | `sql/ice_cash_and_balmo.sql` | `postgresql` | ICE Cash & Balmo Query |
| `config` | `reports/algonquin_gas_transmission.json` | — | Report Config/Map |

The `input_type` field determines how the orchestrator uses the file:
- **`prompt`** — Read during `build_context` to produce the analysis prompt
- **`sql`** — Downloaded and executed during `execute_sql`
- **`config`** — Read during `build_context` as report configuration

---

## 5. Starting a Run

### RunBar UI

The `RunBar` component (top of center panel) shows:
- **Date picker** — defaults to today's date
- **"Start Run" button** — creates a new run
- **Status badge** — `pending` / `running` / `completed` / `failed` / `finalized`
- **StepProgressBar** — appears after run is created

### What Happens on Start

Clicking "Start Run" sends:

```
POST /api/analysis-packs/{packId}/runs
Body: { "trade_date": "2026-03-02" }
```

The API:
1. Verifies the pack exists
2. Inserts a row into `helioscta_agents.pack_runs` with `status = 'pending'`
3. Computes `run_output_path` via `buildRunOutputRoot(wsSlug, date, runId)`
4. Creates **6 step rows** in `helioscta_agents.pack_run_steps`, all with `status = 'pending'`

Response: `{ "run_id": 42, "run_output_path": ".prompts/agt_pipe_balance/runs/2026-03-02/42" }`

### DB State After Start

```
pack_run_steps for run_id=42:
┌──────────┬──────────────────┬────────┬───────────┐
│ step_id  │ step_name        │ status │ step_order│
├──────────┼──────────────────┼────────┼───────────┤
│ 1        │ load_inputs      │pending │ 1         │
│ 2        │ execute_sql      │pending │ 2         │
│ 3        │ compute_metrics  │pending │ 3         │
│ 4        │ build_context    │pending │ 4         │
│ 5        │ generate_report  │pending │ 5         │
│ 6        │ evidence_link    │pending │ 6         │
└──────────┴──────────────────┴────────┴───────────┘
```

---

## 6. Step-by-Step Execution

Steps execute sequentially by clicking each node in the StepProgressBar. Each click sends:

```
POST /api/analysis-runs/{runId}/execute-step
Body: { "stepName": "<step_name>" }
```

> **Note:** The API expects `stepName` (camelCase). The RunBar component sends `step_name` (snake_case) — the API destructures `{ stepName }` from the request body.

The server calls `executeStep(runId, stepName, userEmail)` in `run-orchestrator.ts`, which:
1. Marks the step `running` in DB
2. Marks the run `running` if still `pending`
3. Runs the step handler
4. On success: marks step `completed`, saves `output_json`
5. On failure: marks step `failed`, saves error to `log_text`
6. If all 6 steps completed: marks run `completed`

### Step 1: `load_inputs`

| | |
|---|---|
| **Label** | Load Inputs |
| **Reads** | `analysis_pack_inputs` for the pack; `workspace_files` for each input |
| **Validates** | Each required input file exists in the workspace (active + blob path match) |
| **Also runs** | `validatePackConvention()` — warnings only, does not block |
| **Produces** | `output_json` with `{ inputs_checked, results, convention_warnings }` |
| **Fails if** | Any `required` input file is missing from the workspace |

### Step 2: `execute_sql`

| | |
|---|---|
| **Label** | Execute SQL |
| **Reads** | Pack inputs where `input_type = 'sql'`; downloads SQL text from blob |
| **Executes** | Each SQL file via `executeSql()` using the input's `dialect` (postgresql or mssql) |
| **Validates** | Read-only check via `validateReadOnlySql()` before execution |
| **Produces** | CSV result files uploaded to `{run_output_path}/sql/results/` |
| **Also saves** | Executed SQL to `{run_output_path}/sql/executed/`; records in `sql_runs` table |
| **Fails if** | SQL file not found, validation fails, or query errors |

### Step 3: `compute_metrics`

| | |
|---|---|
| **Label** | Compute Metrics |
| **Reads** | Completed `sql_runs` for this run |
| **Computes** | For each SQL result with 2+ rows: identifies numeric columns, computes current/prior/delta/delta_pct |
| **Produces** | `metrics.json` uploaded to `{run_output_path}/reports/metrics.json` |
| **Skips if** | No SQL results exist (returns `{ status: "skipped" }`) |

`metrics.json` schema (`MetricsOutput`):
```json
{
  "version": 1,
  "trade_date": "2026-03-02",
  "computed_at": "2026-03-02T...",
  "source_sql_run_ids": [1, 2],
  "groups": [
    {
      "group_key": "sql_run_1",
      "label": "SQL Run #1",
      "values": [
        { "key": "total_nom", "label": "total nom", "current": 1200, "prior": 1100, "delta": 100, "delta_pct": 9.09, "unit": "number" }
      ]
    }
  ]
}
```

### Step 4: `build_context`

| | |
|---|---|
| **Label** | Build Context |
| **Reads** | `prompt.md` (prompt input), `config/*.json` (config input), `metrics.json`, completed SQL run results |
| **Produces** | `analysis_draft.md` — a structured markdown document with sections: Prompt, Configuration, Computed Metrics, SQL Results, Instructions |
| **Uploads to** | `{run_output_path}/drafts/analysis_draft.md` |
| **Also** | Registers the file in `workspace_files` |

The context document instructs the report generator to produce a `StructuredReport` with typed sections.

### Step 5: `generate_report`

| | |
|---|---|
| **Label** | Generate Report |
| **Reads** | `analysis_draft.md` from drafts subfolder; `metrics.json` if available |
| **Produces** | `report.json` — a `StructuredReport` with narrative, metric_card, table, chart, and signal sections |
| **Uploads to** | `{run_output_path}/reports/report.json` |
| **Also** | Records in `report_artifacts` table; registers in `workspace_files` |
| **Skips if** | No context document found |

`report.json` top-level schema (`StructuredReport`):
```json
{
  "version": 1,
  "pack_slug": "agt_pipe_balance",
  "trade_date": "2026-03-02",
  "generated_at": "2026-03-02T...",
  "run_id": 42,
  "title": "agt pipe balance — 2026-03-02",
  "summary": "Report with 3 section(s) generated from 2 SQL run(s).",
  "overall_signal": "neutral",
  "sections": [ ... ]
}
```

### Step 6: `evidence_link`

| | |
|---|---|
| **Label** | Evidence Links |
| **Reads** | `report.json` (structured report); falls back to `analysis_draft.md` |
| **Produces** | Rows in `helioscta_agents.evidence_links` linking report sections to SQL runs |
| **Uploads** | `evidence.json` to `{run_output_path}/evidence/evidence.json` |
| **Uses** | Each report section's `evidence_sql_run_ids` to create fine-grained links |
| **Skips if** | No completed SQL runs exist |

---

## 7. Monitoring with StepProgressBar

The `StepProgressBar` (`StepProgressBar.tsx`) renders 6 circular nodes connected by lines.

### Polling

`useRunPoller(runId)` polls `GET /api/analysis-runs/{runId}` every **3 seconds** (`POLL_INTERVAL = 3000`). Polling stops when the run reaches a terminal status: `completed`, `failed`, or `finalized`.

### Status Colors

| Status | Node Border | Inner | Label | Line |
|---|---|---|---|---|
| `pending` | `border-gray-700` | gray dot | `text-gray-600` | `bg-gray-700` |
| `running` | `border-cyan-500` | cyan dot (pulse) | `text-cyan-400` | `bg-cyan-700` |
| `completed` | `border-emerald-500` | green checkmark | `text-emerald-400` | `bg-emerald-700` |
| `failed` | `border-red-500` | red X | `text-red-400` | `bg-gray-700` |
| `skipped` | `border-gray-700` | `bg-gray-600` | `text-gray-600` | `bg-gray-700` |

### Click Interactions

- **Pending node** — click to execute that step (`onExecuteStep`)
- **Failed node** — click to retry (`onRetryStep`)
- **Completed / Running / Skipped** — not clickable (`cursor-default`)

Tooltip shows: `"{label} — click to execute"` or `"{label} — click to retry"`.

---

## 8. Viewing Run Outputs

After the run completes, the center panel tabs update to show output tabs.

### Report Tab

`ReportPreview` fetches `GET /api/analysis-runs/{runId}/report` and renders 5 section types:

| Section Type | Renderer | What It Shows |
|---|---|---|
| `narrative` | `NarrativeRenderer` | Markdown prose (converted to HTML via minimal parser) |
| `metric_card` | `MetricCardRenderer` | Grid of KPI cards with value, delta, trend arrow |
| `table` | `TableRenderer` | Typed data table with column formatting (number, currency, percent, date) |
| `chart` | `ChartRenderer` | Recharts visualization (line, bar, area, composed) with reference lines |
| `signal` | `SignalRenderer` | Directional trading signals with confidence badges |

Each section has an **"Evidence"** link (if `evidence_sql_run_ids` is populated) that opens the EvidencePanel filtered to that section.

### SQL Results Tab

`SqlResultsPanel` fetches `GET /api/workspaces/{workspaceId}/sql-runs` and shows:
- List of SQL runs with dialect badge (postgresql=blue, mssql=purple)
- Status badge (completed=emerald, failed=red, running=cyan)
- Row count and elapsed time
- Expandable detail: full SQL text, error message, result table (first 20 rows)

### Evidence Panel

`EvidencePanel` fetches `GET /api/analysis-runs/{runId}/evidence` and shows:
- Evidence links grouped by `section_key`
- Each link shows `claim_text` (first 200 chars of the section content)
- Clickable "SQL Run #{id}" links to jump to the SQL result
- Optional file links

### Artifacts Hub

`ArtifactHub` fetches `GET /api/analysis-runs/{runId}/artifacts` and shows:
- Artifacts grouped by `artifact_type` (report_json, report_md, csv, evidence)
- Download/view links per artifact

---

## 9. Retrying Failed Steps

When a step fails:
1. Its node turns **red** with an **X** icon
2. The run status badge shows **"failed"**
3. Click the red node to retry

Retry sends:

```
POST /api/analysis-runs/{runId}/retry-step
Body: { "stepName": "execute_sql" }
```

The API:
1. Resets the step: `status = 'pending'`, clears `started_at`, `completed_at`, `log_text`
2. Increments `retry_count`
3. If the run was `failed`, reverts it to `running`

After retry, the node returns to gray (pending) and can be re-executed by clicking.

---

## 10. Run Comparison

Requires `NEXT_PUBLIC_RUN_DIFF_ENABLED = true` (default).

### Workflow

1. Open **RunHistory** dropdown (clock icon, shows run count)
2. Check **two** runs using the checkboxes
3. Click **"Compare"** button (appears when exactly 2 are checked)
4. `RunDiffPanel` opens

### RunDiffPanel

Fetches `GET /api/analysis-runs/{runId}/report` for both runs and:
- Shows overall signal comparison side-by-side
- Extracts `metric_card` sections from both reports
- Displays a KPI delta table:
  - Metric label
  - Run A value / Run B value
  - Absolute change and percentage change
  - Color: emerald for improvement, red for decline

---

## 11. Ad-Hoc SQL Execution

### SqlEditorToolbar

The toolbar provides:
- **Dialect picker** — `<select>` with "PostgreSQL" and "Azure SQL" options
- **Run button** — executes the SQL in the current editor
- **Validate button** — checks SQL without executing

### Execution Flow

Run button calls `POST /api/sql/execute`:

```json
{
  "dialect": "postgresql",
  "sqlText": "SELECT * FROM gas_ebbs.transco_critical_notices LIMIT 10",
  "workspaceId": 1
}
```

### SQL Guardrails

`validateReadOnlySql()` in `sql-validator.ts` blocks:

| Category | Blocked Keywords |
|---|---|
| **DDL** | `CREATE`, `ALTER`, `DROP`, `TRUNCATE` |
| **DML** | `INSERT`, `UPDATE`, `DELETE`, `MERGE` |
| **Exec** | `EXEC`, `EXECUTE`, `CALL`, `xp_*`, `sp_*` |
| **DCL** | `GRANT`, `REVOKE`, `DENY` |
| **Other** | `SELECT INTO`, multi-statement (multiple `;`) |

Comments (`--` and `/* */`) are stripped before scanning.

### Validate-Only

Validate button calls `POST /api/sql/validate`:

```json
{ "sqlText": "SELECT ..." }
```

Returns `{ "valid": true }` or `{ "valid": false, "errors": ["..."] }`.

---

## 12. Chat + Context

### WorkbenchChat

The right panel hosts `WorkbenchChat`, which provides:
- **AgentSelector** — pick which agent to chat with
- **ConversationList** — view/switch conversations
- **ContextChips** — files attached to the current message
- **CostEstimateBar** — estimated token cost before sending

Messages are sent via `POST /api/agents/{agentId}/chat` with `workspaceContext` including `workspaceId` and `fileIds`.

### ContextChips

Files selected in FolderExplorer appear as removable chips above the message area. Each chip shows:
- File type badge (color-coded: md=blue, csv=green, sql=orange, json=purple)
- File name
- Estimated token count (`~{bytes/4}t`)
- Total token count with "over budget" warning if > 2,500 tokens

### DatasetCatalog "+ctx" Injection

The `DatasetCatalog` sidebar (when `DATASET_DISCOVERY_ENABLED = true`):
1. Fetches table metadata from `GET /api/datasets/catalog`
2. Groups tables by schema
3. Each table row has a **"+ctx"** button (visible on hover)
4. Clicking "+ctx" injects a context string into the chat:
   `"Available table: schema.table_name (columns: col1 type, col2 type, ...)"`

---

## 13. Simulating a Minimal Test Run

### Using the Seed Data

The `005_seed_agt_pack.sql` migration seeds the AGT Pipe Balance pack. After applying it, you have:
- Workspace: `agt_pipe_balance`
- Pack: `agt_pipe_balance` with 4 declared inputs

### Minimum Files for a Clean Run

Upload these files to the workspace via FolderExplorer or onboarding:

#### `prompt.md`

```markdown
# AGT Pipe Balance Analysis

Analyze the Algonquin Gas Transmission pipeline balance for the given trade date.
Summarize key nomination changes and pricing movements.
```

#### `sql/agt_noms.sql` (dialect: mssql)

```sql
SELECT TOP 10
  gas_day,
  pipeline_name,
  loc_name,
  scheduled_cap,
  operational_cap
FROM noms_v1_2026_jan_02.source_v1_genscape_noms
WHERE pipeline_short_name = 'AGT'
ORDER BY gas_day DESC
```

> If Azure SQL is not configured, change this input's dialect to `postgresql` in the DB and write a query against a PostgreSQL table instead.

#### `sql/ice_cash_and_balmo.sql` (dialect: postgresql)

```sql
SELECT
  notice_identifier,
  notice_type,
  subject,
  posted_datetime
FROM gas_ebbs.algonquin_critical_notices
ORDER BY posted_datetime DESC
LIMIT 10
```

#### `reports/algonquin_gas_transmission.json`

```json
{
  "pipeline": "algonquin",
  "report_type": "pipe_balance",
  "sections": ["nominations", "pricing", "summary"]
}
```

### Expected Results After All 6 Steps

| Step | Expected Output |
|---|---|
| `load_inputs` | 4 inputs checked, all found, 0 convention warnings |
| `execute_sql` | 2 SQL inputs executed, CSV results uploaded |
| `compute_metrics` | metrics.json with numeric deltas from SQL results |
| `build_context` | analysis_draft.md with prompt + config + metrics + SQL results |
| `generate_report` | report.json with narrative + metric_card sections |
| `evidence_link` | Evidence links mapping report sections to SQL runs |

---

## 14. API Quick Reference

### Pack Lifecycle

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/analysis-packs` | List all packs (with latest run status) |
| `POST` | `/api/analysis-packs` | Create a new pack |
| `GET` | `/api/analysis-packs/{packId}` | Pack detail + inputs + recent runs |
| `PATCH` | `/api/analysis-packs/{packId}` | Update pack metadata |

### Run Lifecycle

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/analysis-packs/{packId}/runs` | Start a new run (creates 6 pending steps) |
| `GET` | `/api/analysis-runs/{runId}` | Run summary + step statuses + artifact paths |
| `POST` | `/api/analysis-runs/{runId}/execute-step` | Execute a single step |
| `POST` | `/api/analysis-runs/{runId}/retry-step` | Retry a failed step |
| `POST` | `/api/analysis-runs/{runId}/finalize` | Finalize a completed run |
| `POST` | `/api/analysis-runs/{runId}/generate-report` | Trigger report generation |

### Run Outputs

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/analysis-runs/{runId}/report` | Download structured report JSON |
| `GET` | `/api/analysis-runs/{runId}/artifacts` | List report artifacts |
| `GET` | `/api/analysis-runs/{runId}/evidence` | List evidence links |

### SQL

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/sql/execute` | Validate + execute SQL (records in sql_runs) |
| `POST` | `/api/sql/validate` | Validate SQL only (read-only check) |
| `GET` | `/api/workspaces/{workspaceId}/sql-runs` | SQL run history for workspace |

### Workspace Files

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/workspaces/{workspaceId}/files` | List workspace files |
| `POST` | `/api/workspaces/{workspaceId}/files` | Create/upload a file |
| `PUT` | `/api/workspaces/{workspaceId}/files/{fileId}` | Update file content |
| `DELETE` | `/api/workspaces/{workspaceId}/files/{fileId}` | Delete a file |

---

## 15. Troubleshooting

### Missing Input Files

**Symptom:** `load_inputs` step fails with `Required input not found: sql/agt_noms.sql`

**Fix:** Ensure all files declared in `analysis_pack_inputs` exist in the workspace. Check:
```sql
SELECT file_path, required FROM helioscta_agents.analysis_pack_inputs WHERE pack_id = ?;
SELECT blob_path, is_active FROM helioscta_agents.workspace_files WHERE workspace_id = ?;
```

### SQL Validation Failures

**Symptom:** `execute_sql` step fails with `Forbidden keyword detected: INSERT`

**Fix:** Pack SQL inputs must be read-only (SELECT/WITH only). Remove any DDL, DML, EXEC, or multi-statement SQL. Use `POST /api/sql/validate` to test beforehand.

### Blob Storage Errors

**Symptom:** Steps fail with `HTTP 403` or `ContainerNotFound`

**Fix:** Verify `AZURE_STORAGE_CONNECTION_STRING` and `AZURE_STORAGE_CONTAINER_NAME` in `.env.local`. Ensure the container exists and the connection string has write permissions.

### No SQL Results for Metrics

**Symptom:** `compute_metrics` returns `{ status: "skipped", message: "No SQL results to compute metrics from" }`

**Fix:** This is not an error — it means `execute_sql` produced no completed `sql_runs` rows. Verify the SQL queries returned data and that `execute_sql` completed successfully.

### No Context Document

**Symptom:** `generate_report` returns `{ status: "skipped", message: "No context document found to generate report from" }`

**Fix:** Ensure `build_context` completed successfully. Check that `analysis_draft.md` was uploaded to the correct blob path.

### Budget Exceeded (Chat)

**Symptom:** Chat returns HTTP 429 with "Budget limit reached"

**Fix:** Start a new conversation or wait for the budget window to reset. The `CostEstimateBar` shows estimated token usage before sending.

### Run Stuck in "running"

**Symptom:** Run status shows "running" but no steps are actively executing

**Fix:** Check if a step failed silently. Query:
```sql
SELECT step_name, status, log_text FROM helioscta_agents.pack_run_steps WHERE run_id = ?;
```
If a step is stuck in `running`, it may have timed out (120s max for execute-step). Reset manually:
```sql
UPDATE helioscta_agents.pack_run_steps SET status = 'failed', log_text = 'Manual reset' WHERE run_id = ? AND status = 'running';
UPDATE helioscta_agents.pack_runs SET status = 'failed' WHERE run_id = ?;
```

### Azure SQL Connection Failures

**Symptom:** `execute_sql` fails for `mssql` dialect queries

**Fix:** Verify Azure SQL env vars (`AZURE_SQL_DB_HOST`, `AZURE_SQL_DB_USER`, `AZURE_SQL_DB_PASSWORD`, etc.) in `.env.local`. Ensure `mssql` and `tedious` are in `serverExternalPackages` in `next.config.ts`.
