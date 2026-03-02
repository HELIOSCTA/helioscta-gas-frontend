# Analysis Pack Folder Structure Standard (v1)

## Summary
Define a single, reusable folder convention for analysis tasks under `.prompts/`, using `agt_pipe_balance` as the reference pattern.  
This standard keeps hand-authored sources separate from generated run outputs, supports analyst workflows, and aligns with your existing workbench + analysis-pack APIs.

## Locked Decisions
1. Canonical location is repo-based: `.prompts/<pack_slug>/`.
2. Generated artifacts are date-partitioned under `runs/YYYY-MM-DD/<run_id>/`.
3. Validation is convention-first (warnings, not hard-fail).
4. SQL policy is hybrid:
1. Core SQL scripts are explicit files in `sql/`.
2. Agent can run exploratory/discovery SQL, but those are saved as generated artifacts.

## Target Folder Layout
```text
.prompts/
  <pack_slug>/
    pack.md
    prompt.md
    analysis/
      working.md
      final.md
    sql/
      core/
        10_<topic>.sql
        20_<topic>.sql
      exploratory/
        README.md
      archive/
    assets/
      maps/
      reference/
    reports/
      reference/
    runs/
      YYYY-MM-DD/
        run_<id>/
          logs/
            run.log
            step_<step_name>.log
          sql/
            executed/
              <query_name>.sql
            results/
              <query_name>.csv
              <query_name>.json
          drafts/
            analysis_draft.md
          reports/
            report.html
            report.md
            report_data.json
          evidence/
            evidence_links.json
```

## File and Task Rules
1. `pack.md` is the pack descriptor and operating instructions (human-readable).
2. `prompt.md` is the analyst/agent task brief for the current cycle.
3. `analysis/working.md` is iterative narrative; `analysis/final.md` is final approved narrative.
4. `sql/core/` contains stable, versioned SQL scripts required by the pack.
5. `sql/exploratory/` is optional; ad-hoc/discovery SQL can be promoted into `sql/core/` if reused.
6. `assets/maps/` stores structured source assets (json/csv/geo-like data).
7. `reports/reference/` stores external reference documents (`.html`, `.mhtml`, pdf exports).
8. `runs/` stores all generated outputs, never manually edited.
9. File names use `snake_case`; SQL files in `core/` use numeric prefixes (`10_`, `20_`, `30_`) to encode logical order.
10. Each run folder is immutable after finalization except for append-only logs.

## Pack Descriptor (`pack.md`) Minimum Structure
1. `Pack`: slug, display name, owner.
2. `Objective`: what decision/output this pack produces.
3. `Inputs`: required and optional source files with relative paths.
4. `Core SQL`: required scripts and target dialect (`mssql` or `postgresql`).
5. `Run Steps`: expected step sequence.
6. `Output Contract`: files that must exist after a successful run.
7. `Review Checklist`: analyst approval criteria before finalization.

## Task Structuring Model
1. One pack = one durable analysis domain (example: AGT pipeline balance).
2. One run = one execution date/trade-date cycle for that pack.
3. One prompt cycle updates `prompt.md` and `analysis/working.md`.
4. Final analyst signoff publishes into `analysis/final.md` and `runs/.../reports/*`.

## Mapping for Existing `agt_pipe_balance`
1. Keep:
1. `.prompts/agt_pipe_balance/prompt.md`
2. `.prompts/agt_pipe_balance/sql/agt_noms.sql`
3. `.prompts/agt_pipe_balance/sql/ice_cash_and_balmo.sql`
4. `.prompts/agt_pipe_balance/reports/algonquin_gas_transmission.json` (move to `assets/maps/` in v1 migration)
2. Re-home:
1. Current `analysis.md` -> `analysis/working.md` (and optionally snapshot to `analysis/final.md` once approved).
2. Existing generated report files -> `runs/2026-02-27/run_0001/reports/`.
3. Existing external reference report (`Research Viewer...mhtml`) -> `reports/reference/`.
3. Normalize SQL archive:
1. `.prompts/agt_pipe_balance/sql/.archive/*` -> `sql/archive/*`.

## Public API / Type Changes Needed
1. `GET /api/analysis-packs/:packId` should include resolved folder paths:
1. `pack_path`
2. `core_sql_paths`
3. `analysis_paths`
4. `latest_run_path`
2. `POST /api/analysis-packs/:packId/runs` should persist run output root:
1. `run_output_path` = `.prompts/<pack_slug>/runs/YYYY-MM-DD/run_<id>/`.
3. `POST /api/analysis-runs/:runId/execute-step` should write step outputs into standardized run subfolders (`logs/`, `sql/results/`, `reports/`, `evidence/`).
4. `AnalysisPackInput` type should include:
1. `category` (`core_sql`, `reference_report`, `map_asset`, `prompt`, `analysis_target`)
2. `relative_path`
3. `required` (warning-only enforcement under convention mode)
5. Add `RunArtifactPathMap` type in analysis types:
1. explicit fields for report/draft/evidence/sql-result/log paths.

## Implementation Checklist (File-Mapped)
1. Document standard in:
1. `.skills/folder_structure.md`
2. Create canonical pack descriptor template:
1. `.prompts/_templates/pack.md`
3. Update AGT pack structure:
1. `.prompts/agt_pipe_balance/analysis/working.md`
2. `.prompts/agt_pipe_balance/analysis/final.md`
3. `.prompts/agt_pipe_balance/assets/maps/algonquin_gas_transmission.json`
4. `.prompts/agt_pipe_balance/reports/reference/Research Viewer - AGT Pipeline Balance - 2026-02-27.mhtml`
4. Update orchestrator writes:
1. `frontend/lib/run-orchestrator.ts` to emit standardized run paths under `runs/YYYY-MM-DD/run_<id>/...`
5. Update run creation metadata:
1. `frontend/app/api/analysis-packs/[packId]/runs/route.ts` to compute/store `run_output_path`.
6. Update run detail API:
1. `frontend/app/api/analysis-runs/[runId]/route.ts` to return artifact path map.
7. Update workbench UI labels for standardized sections:
1. `frontend/components/workbench/RunHistory.tsx`
2. `frontend/components/workbench/ReportPreview.tsx`
3. `frontend/components/workbench/SqlResultsPanel.tsx`
8. Add migration for optional path metadata fields (if DB-backed path tracking is required):
1. `backend/migrations/006_pack_path_metadata.sql`

## Validation Rules (Convention-Only)
1. Warn if `prompt.md` missing.
2. Warn if `analysis/working.md` missing.
3. Warn if no SQL exists in `sql/core/`.
4. Warn if no map/reference assets found when pack requires them.
5. Warn if run output lacks required report files after `render_report`.
6. Never block run start solely on missing conventions in v1.

## Test Cases and Scenarios
1. AGT pack with full structure:
1. Run creates expected folders under `runs/YYYY-MM-DD/run_<id>/`.
2. SQL results and reports appear in correct subfolders.
2. Minimal pack (SQL-only):
1. Warnings appear for missing non-core files.
2. Run still executes SQL and stores outputs.
3. Hybrid SQL behavior:
1. Core SQL from `sql/core/` executes first.
2. Exploratory SQL is captured under `runs/.../sql/executed/`.
4. Reference artifacts:
1. Existing `.mhtml/.html` files remain discoverable in `reports/reference/`.
5. Finalization:
1. `analysis/final.md` and run report artifacts stay consistent with finalized run ID.

## Assumptions and Defaults
1. `.prompts/` remains git-versioned and human-readable.
2. Workbench remains the execution UI; folder structure is the storage convention.
3. Generated artifacts are append-only per run.
4. Convention warnings are surfaced in UI/API responses but do not block v1 execution.
5. Existing packs can be migrated incrementally, not all at once.
