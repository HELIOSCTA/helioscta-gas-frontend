# Default Workspace Initialization

## Summary

Define what a new workspace should auto-populate with when created. Currently a new workspace creates only a database record with no files or folder structure. This adds a scaffold step that seeds the standard folder layout and template files so analysts have a ready-to-use workspace from the start.

Depends on: [Folder Structure](./folder-structure/folder_structure.md), [How Agents Are Enabled](./token-cost/how-agents-are-enabled.md)

---

## What Gets Scaffolded

When `POST /api/workspaces` creates a new workspace, seed these files into blob storage and register them in `workspace_files`:

### Template Files

| File | Purpose | Initial Content |
|------|---------|-----------------|
| `prompt.md` | Task brief for the current analysis cycle | Blank template with section headers (Objective, Inputs, Core SQL, Run Steps, Output Contract, Review Checklist) |
| `analysis/working.md` | Iterative analyst narrative | Empty file with a header comment: `<!-- Working analysis notes — edit freely -->` |
| `sql/exploratory/README.md` | Documents the exploratory SQL folder | One-liner explaining ad-hoc queries can be placed here and promoted to `sql/core/` if reused |

### Empty Folders

Blob storage is flat (no real folders), so empty folders are represented by placeholder conventions:

| Folder | Created When |
|--------|-------------|
| `sql/core/` | On-demand when first SQL script is added |
| `assets/maps/` | On-demand when first asset is uploaded |
| `reports/reference/` | On-demand when first reference doc is added |
| `runs/` | Auto-created by orchestrator on first pack run |
| `reports/charts/` | Auto-created by `render_charts` step |

Only `prompt.md`, `analysis/working.md`, and `sql/exploratory/README.md` are physically created at workspace init. All other folders materialize on-demand.

---

## What Is NOT Scaffolded (Handled Elsewhere)

| Concern | Handled By |
|---------|-----------|
| Agent assignment | Auto-selected (first active agent) — see [How Agents Are Enabled](./token-cost/how-agents-are-enabled.md) |
| Dataset catalog injection | Injected into agent system prompt at chat time — see [Dataset Catalog](./Dataset%20Catalog%20for%20Agent%20Discovery.md) |
| Run output folders (`logs/`, `drafts/`, `evidence/`) | Created by run orchestrator per pack run — see [Agent Artifacts](./Agent%20Artifacts.md) |
| Pack definition (`pack.md`) | Created when an analysis pack is attached to the workspace |
| Token budget config | Server-side env vars — see [Token Costs](./token-cost/skills-token-costs.md) |

---

## `prompt.md` Template

```markdown
# [Pack Name] — Analysis Brief

## Objective
<!-- What decision or output does this analysis produce? -->

## Inputs
<!-- List required and optional source files with relative paths -->

## Core SQL
<!-- Required SQL scripts and target dialect (mssql or postgresql) -->

## Run Steps
<!-- Expected step sequence for the orchestrator -->

## Output Contract
<!-- Files that must exist after a successful run -->

## Review Checklist
<!-- Analyst approval criteria before finalization -->
```

---

## Implementation

### API Change

Modify `POST /api/workspaces` (or add a post-creation hook) to call `scaffoldWorkspace(workspaceId, workspaceType)`.

**`scaffoldWorkspace` logic:**
1. Build blob paths using the workspace's storage convention:
   - Agent workspace: `agents/{agent_id}/{file_path}`
   - Project workspace: `projects/{slug}/{file_path}`
2. For each template file (`prompt.md`, `analysis/working.md`, `sql/exploratory/README.md`):
   - Upload content to blob storage.
   - Insert `workspace_files` row with `source = 'scaffold'`.
3. Skip files that already exist (idempotent — safe to call on existing workspaces).

### File Registration

Each scaffolded file creates a `workspace_files` record:

| Field | Value |
|-------|-------|
| `workspace_id` | From the newly created workspace |
| `file_name` | e.g. `prompt.md` |
| `parent_path` | e.g. `analysis/` or empty string for root |
| `file_type` | `md` |
| `mime_type` | `text/markdown` |
| `source` | `scaffold` |
| `is_active` | `TRUE` |

### Workspace Type Differences

No differentiation in v1. Both `project` and `agent` workspaces get the same three starter files.

---

## Test Cases

1. **New workspace creation**: `POST /api/workspaces` returns workspace with 3 files visible in folder explorer.
2. **Idempotency**: Calling `scaffoldWorkspace` twice on the same workspace does not duplicate files.
3. **Blob paths**: Files appear at correct blob paths based on workspace type (`agents/` vs `projects/`).
4. **Folder explorer**: `FolderExplorer` component displays scaffolded files in correct hierarchy.
5. **Editable**: User can immediately edit `prompt.md` and `analysis/working.md` in the workbench editor.
6. **Pack creation**: When a pack is attached, `pack.md` is added alongside existing scaffold files without conflict.
