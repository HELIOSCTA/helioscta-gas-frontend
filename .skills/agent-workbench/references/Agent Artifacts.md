# Agent Artifacts v1.1 (Full Feature, Queue-Gated Discovery, Immutable Refresh)

## Summary
This replacement plan delivers full artifact lifecycle support while fixing v1 drift: it aligns paths with current code, adds a real `render_charts` step, introduces immutable refresh snapshots, and replaces direct catalog auto-insert with a review queue.

## Public API, Interface, and Type Changes
1. Add `POST /api/analysis-runs/[runId]/refresh` to create a new refresh snapshot run and replay dashboard SQL sources.
2. Add `GET /api/analysis-runs/[runId]/export-html` to generate/store `report.html` and return HTML.
3. Add internal authenticated discovery review APIs: `GET /api/dataset-catalog/discovery`, `POST /api/dataset-catalog/discovery/[discoveryId]/approve`, `POST /api/dataset-catalog/discovery/[discoveryId]/reject`.
4. Update `StepName` and `PACK_STEPS` to include `render_charts` between `generate_report` and `evidence_link`.
5. Add `RunKind = "standard" | "refresh"` and extend `PackRun` with `run_kind` and `parent_run_id`.
6. Add explicit artifact type union: `"sql_result" | "metrics" | "report_json" | "dashboard" | "chart_png" | "html" | "evidence_json"`.
7. Add `DashboardDefinition`, `DashboardDataSource`, `DashboardSection`, and `RefreshResult` types.
8. Extend `ChartSection` with optional `rendered_png_path`.
9. Replace stale `RunArtifactPathMap` file fields with canonical run artifact fields: `metricsJson`, `reportJson`, `dashboardJson`, `reportHtml`, `chartsDir`, `evidenceJson`.

## Database Plan
1. Create migration `013_artifact_lineage_and_registry.sql`; add `pack_runs.run_kind` with check (`standard`,`refresh`), add `pack_runs.parent_run_id` FK to `pack_runs`, add `sql_runs.source_sql_run_id`, add `sql_runs.source_key`, add unique index on `report_artifacts(run_id, artifact_type, blob_path)`, add indexes for parent run lineage and artifact lookup.
2. Create migration `014_dataset_catalog_discovery_queue.sql`; create `dataset_catalog_discovery_queue` with `run_id`, `sql_run_id`, `dialect`, `schema_name`, `table_name`, `normalized_ref`, `proposed_slug`, `status`, review audit fields, timestamps.
3. Add partial unique index on discovery queue for pending dedupe by `(dialect, schema_name, table_name)` where `status='pending'`.

## Runtime Behavior
1. Standard pipeline is now 7 steps in this exact order: `load_inputs`, `execute_sql`, `compute_metrics`, `build_context`, `generate_report`, `render_charts`, `evidence_link`.
2. `execute_sql` writes CSV result blobs, inserts `workspace_files`, inserts `report_artifacts` as `sql_result`, then enqueues discovered table refs (best-effort, non-fatal).
3. `generate_report` writes `reports/report.json` and also writes `reports/dashboard.json` built from completed `sql_runs`; both are registered as artifacts.
4. `render_charts` reads `report.json`, renders chart sections to SVG, converts via `@resvg/resvg-js`, uploads `reports/charts/<section_key>.png`, registers `chart_png` artifacts, then patches `report.json` with `rendered_png_path`; if no chart sections, step is `skipped`.
5. `evidence_link` continues link creation and additionally registers `evidence/evidence.json` as `evidence_json`.
6. Refresh never mutates source runs; `POST /refresh` creates a new `pack_runs` row with `run_kind='refresh'` and `parent_run_id=<source_run>`.
7. Refresh step handling is deterministic: mark `load_inputs` skipped, perform dashboard SQL replay as `execute_sql` output for the new run, then run `compute_metrics`, `build_context`, `generate_report`, `render_charts`, `evidence_link`.
8. SQL replay writes new `sql_runs` rows and sets `source_sql_run_id` back to original dashboard source rows for lineage.

## Discovery Queue and Approval Rules
1. Table extraction strips comments/strings first, then parses `FROM`/`JOIN` references with dialect-aware identifier normalization.
2. Discovery only writes queue records; it never writes active catalog rows directly.
3. Queue insertion skips already-active catalog datasets and dedupes pending entries.
4. Approval endpoint upserts skeleton metadata into `dataset_catalog` and marks queue row `approved` with reviewer audit fields.
5. Reject endpoint marks queue row `rejected` with reviewer note and does not modify catalog.

## Files to Touch
1. `frontend/lib/types/analysis.ts` for step/type/interface changes.
2. `frontend/lib/run-paths.ts` for canonical artifact path map updates.
3. `frontend/lib/run-orchestrator.ts` for step insertion, artifact registration helper usage, dashboard generation, chart rendering, discovery enqueue hook.
4. New `frontend/lib/chart-renderer.ts` for deterministic SVG generation and PNG conversion.
5. New `frontend/lib/dataset-discovery.ts` for SQL table extraction and queue writes.
6. New refresh route: `frontend/app/api/analysis-runs/[runId]/refresh/route.ts`.
7. New export route: `frontend/app/api/analysis-runs/[runId]/export-html/route.ts`.
8. New discovery review routes under `frontend/app/api/dataset-catalog/discovery/...`.
9. `frontend/app/api/analysis-runs/[runId]/artifacts/route.ts` to normalize artifact response shape.

## Implementation Sequence
1. Apply DB migrations 013 then 014.
2. Refactor orchestrator helpers so artifact registration and SQL result persistence are reusable by both normal runs and refresh flows.
3. Add `render_charts` step support in types, step seed creation, and step handler map.
4. Add dashboard generation in `generate_report`.
5. Add refresh endpoint with snapshot run creation and partial pipeline execution.
6. Add HTML export endpoint and artifact registration.
7. Add discovery queue writer + discovery review APIs.
8. Add feature flags: `ARTIFACT_CHART_RENDER_ENABLED`, `RUN_REFRESH_ENABLED`, `DATASET_DISCOVERY_QUEUE_ENABLED` (all default `true`).
9. Roll out progressively by enabling flags in staging first, then production.

## Test Cases and Scenarios
1. Migration idempotency: rerun migrations without failure and verify new constraints/indexes.
2. Standard run artifact completeness: verify artifacts contain `sql_result`, `metrics`, `report_json`, `dashboard`, optional `chart_png`, `evidence_json`.
3. Chart rendering: verify at least one chart section produces PNG and `rendered_png_path` update.
4. Refresh immutability: verify source run unchanged and new run created with `parent_run_id`.
5. Refresh lineage: verify refreshed `sql_runs.source_sql_run_id` values are populated.
6. Discovery dedupe: repeated SQL refs in one run create one pending queue row.
7. Discovery approval: approving one queue row creates/updates one catalog entry and updates review audit columns.
8. HTML export: verify `report.html` stored, artifact row present, endpoint returns `text/html`.
9. Retry idempotency: rerunning a step updates existing artifact rows via unique index instead of unbounded duplicates.

## Assumptions and Defaults
1. Dataset catalog baseline schema from the dataset-catalog plan is already available.
2. Review queue is DB-backed; no external worker/queue system is introduced in v1.
3. All new APIs remain authenticated via existing `requireAuth()`.
4. Refresh always creates new run snapshots; in-place refresh is not supported.
5. If chart rendering fails for a section, that section is logged/skipped and the run continues unless all sections fail.
