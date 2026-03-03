# Populate `Future Improvments.md` with a Skill-Aligned UX Roadmap

## Summary
Create a single reference document that captures the prioritized UX improvements derived from `skill-agent-workbench.md` and its linked references, with concrete implementation touchpoints, API/type impacts, and validation scenarios.

## Important Changes or Additions to Public APIs/Interfaces/Types
1. Document planned API additions:
- `POST /api/analysis-runs/[runId]/refresh`
- `GET /api/analysis-runs/[runId]/export-html`
- `GET /api/dataset-catalog/discovery`
- `POST /api/dataset-catalog/discovery/[discoveryId]/approve`
- `POST /api/dataset-catalog/discovery/[discoveryId]/reject`

2. Document planned type/interface additions:
- `StepName` adds `render_charts`
- `RunKind = "standard" | "refresh"`
- `DashboardDefinition`, `DashboardDataSource`, `RefreshResult`
- Explicit artifact type union for run outputs

3. Document UX contract changes:
- Persistent conversation per workspace session
- Explicit agent selection in workbench
- Run progress strip with retry and step detail
- Cost preflight and high-cost action confirmations

## Proposed File Content (replace entire file)
```md
# Future Improvements - Agent Workbench UX

## Objective
Capture a prioritized UX roadmap based on the Agent Workbench skill set:
- Token Costs
- How Agents Are Enabled
- Default Workspace
- Dataset Catalog for Agent Discovery
- Progress Bar
- Agent Artifacts

## Priority 0 (Highest Impact)

### 1) Persistent Chat + Agent Selector
Problem:
- Workbench chat currently auto-selects first active agent and creates a new conversation per send.

Improvements:
- Add agent picker in Workbench chat header.
- Persist `conversationId` per workspace session.
- Add conversation resume panel (recent conversations per selected agent).

Primary touchpoints:
- `frontend/components/workbench/WorkbenchChat.tsx`
- `frontend/app/api/agents/route.ts`
- `frontend/app/api/agents/[agentId]/conversations/route.ts`
- `frontend/app/api/agents/[agentId]/conversations/[conversationId]/messages/route.ts`

### 2) Workspace Creation Onboarding
Problem:
- New workspaces are empty; users start without structure.

Improvements:
- Auto-scaffold starter files on workspace create:
  - `prompt.md`
  - `analysis/working.md`
  - `sql/exploratory/README.md`
- Show first-run checklist in workbench landing state.

Primary touchpoints:
- `frontend/app/api/workspaces/route.ts`
- `frontend/app/workbench/[workspaceId]/WorkbenchClient.tsx`
- `frontend/app/HomePageClient.tsx`

### 3) Run Progress UX in Workbench
Problem:
- No inline run lifecycle visibility in current workbench UI.

Improvements:
- Add horizontal step progress strip with polling.
- Show status, duration, retry count, and failure tooltip.
- Allow retry on failed step from the bar.

Primary touchpoints:
- `frontend/app/workbench/[workspaceId]/WorkbenchClient.tsx`
- `frontend/app/api/analysis-runs/[runId]/route.ts`
- `frontend/app/api/analysis-runs/[runId]/retry-step/route.ts`
- `frontend/app/api/analysis-runs/[runId]/execute-step/route.ts`

### 4) Proactive Cost UX
Problem:
- Budget feedback is mostly reactive (after request submission).

Improvements:
- Show token/cost estimate before send.
- Default concise mode ON.
- Confirm high-cost actions:
  - Full-file context injection
  - Full report regeneration
  - High-tier model use

Primary touchpoints:
- `frontend/components/workbench/WorkbenchChat.tsx`
- `frontend/app/api/agents/[agentId]/chat/route.ts`
- `frontend/lib/feature-flags.ts`

### 5) Context Visibility Improvements
Problem:
- Context chips display `File #id`, not meaningful context.

Improvements:
- Show file name, type, estimated token weight.
- Allow reorder and remove in context list.
- Warn when context exceeds preferred budget.

Primary touchpoints:
- `frontend/components/workbench/ContextChips.tsx`
- `frontend/components/workbench/WorkbenchChat.tsx`

## Priority 1 (Medium Term)

### 6) Artifact Hub
Improvements:
- Add run artifact drawer with grouped outputs:
  - SQL result CSVs
  - `metrics.json`
  - `report.json`
  - chart PNGs
  - `report.html`
  - evidence JSON
- Add quick preview/open/download actions.

Primary touchpoints:
- `frontend/app/api/analysis-runs/[runId]/artifacts/route.ts`
- `frontend/app/api/analysis-runs/[runId]/report/route.ts`
- `frontend/app/api/analysis-runs/[runId]/evidence/route.ts`

### 7) Refresh Snapshot + Lineage UX
Improvements:
- Refresh creates new snapshot run (`parent_run_id` linkage).
- Show source run -> refresh run lineage and KPI diffs.

Primary touchpoints:
- `POST /api/analysis-runs/[runId]/refresh`
- `frontend/lib/types/analysis.ts`
- run history UI components (new or extended)

### 8) Dataset Discovery Review Inbox
Improvements:
- Add pending discovery queue UI for dataset references extracted from SQL runs.
- Approve/reject workflow with metadata enrichment fields.

Primary touchpoints:
- discovery queue APIs under `/api/dataset-catalog/discovery/*`
- dataset catalog internal types/services

## Priority 2 (Quality of Life)

### 9) Pack Selector + Management
Problem:
- No way to create, select, or manage analysis packs from within the workbench. Analysts must use the API directly. CLAUDE.md references a `PackSelector` component that does not exist.

Improvements:
- Add pack picker dropdown in workbench toolbar (select active pack for runs).
- Allow creating a new pack from within the workbench (name, slug, description).
- Show pack inputs and required files inline.

Primary touchpoints:
- `frontend/app/workbench/[workspaceId]/WorkbenchClient.tsx`
- `frontend/app/api/analysis-packs/route.ts`
- `frontend/app/api/analysis-packs/[packId]/route.ts`
- `frontend/lib/types/analysis.ts`

### 10) Run History Panel
Problem:
- No way to browse past runs for a pack. CLAUDE.md references a `RunHistory` component that does not exist. Distinct from #3 (progress bar shows the *current* run; this shows *all* runs).

Improvements:
- Add collapsible run history list in left panel or as a drawer.
- Show run date, status, duration, and step summary per run.
- Click a run to load its artifacts into the center panel.

Primary touchpoints:
- `frontend/app/api/analysis-packs/[packId]/route.ts` (returns recent runs)
- `frontend/app/api/analysis-runs/[runId]/route.ts`
- `frontend/app/workbench/[workspaceId]/WorkbenchClient.tsx`

### 11) Evidence Panel
Problem:
- Evidence links are generated by the pipeline (`evidence.json`) but there is no UI to browse section-to-SQL pairings. CLAUDE.md references an `EvidencePanel` component that does not exist.

Improvements:
- Add evidence panel showing report sections linked to their source SQL queries and result rows.
- Click a section to highlight the supporting SQL evidence.
- Click a SQL reference to open the result in the editor.

Primary touchpoints:
- `frontend/app/api/analysis-runs/[runId]/evidence/route.ts`
- `frontend/app/api/analysis-runs/[runId]/artifacts/route.ts`

### 12) File Search in Folder Explorer
Problem:
- `FolderExplorer` has a fixed folder structure with no search or filter. As workspaces accumulate run artifacts across many dates, finding files becomes painful.

Improvements:
- Add a search/filter input at the top of the folder explorer.
- Filter file tree by name as the user types.
- Highlight matching files across all folders.

Primary touchpoints:
- `frontend/components/workbench/FolderExplorer.tsx`

### 13) SQL Results Browser
Problem:
- `GET /api/workspaces/[workspaceId]/sql-runs` endpoint exists but has no UI. Distinct from #6 Artifact Hub — this is a browsable history of all SQL executions across runs, not just artifacts from a single run.

Improvements:
- Add SQL runs panel showing query history: query text, dialect, row count, duration, status.
- Click a run to preview the result CSV inline.
- Filter by dialect, date range, or run ID.

Primary touchpoints:
- `frontend/app/api/workspaces/[workspaceId]/sql-runs/route.ts`
- `frontend/components/workbench/FolderExplorer.tsx` or new panel

### 14) Inline SQL Execution from Editor
Problem:
- `/api/sql/execute` and `/api/sql/validate` endpoints exist with full guardrailing, but there is no "Run" button when viewing `.sql` files in the editor. Analysts must use the chat or API to test queries.

Improvements:
- Add a "Run SQL" button in the editor toolbar when a `.sql` file is open.
- Show result preview below the editor (table view with pagination).
- Validate before execution; show validation errors inline.

Primary touchpoints:
- `frontend/app/workbench/[workspaceId]/WorkbenchClient.tsx`
- `frontend/app/api/sql/execute/route.ts`
- `frontend/app/api/sql/validate/route.ts`
- `frontend/components/workbench/FileEditor.tsx`

## Consistency Fix (Immediate)
Problem:
- Progress docs describe 6 steps while artifacts roadmap introduces 7 (`render_charts`).

Improvement:
- Standardize all step docs, type unions, and UI labels to the same ordered pipeline.

## Validation Scenarios

1. New workspace UX
- User creates workspace and immediately sees scaffolded files and checklist.

2. Chat continuity UX
- User sends 3 messages in same session and sees one persisted conversation thread.

3. Cost guardrail UX
- User attaches heavy context and gets pre-send cost warning + explicit confirm.

4. Run progress UX
- User observes step transitions (`pending` -> `running` -> `completed/failed`) with live updates.

5. Artifact discoverability UX
- User opens artifact panel and can access report/evidence/sql outputs without path hunting.

6. Refresh lineage UX
- User refreshes a run and sees a new linked run with updated artifacts and source linkage.

7. Discovery moderation UX
- Reviewer approves one discovered table and sees it materialized in dataset catalog.

8. Pack management UX
- User selects a pack from the workbench toolbar and starts a new run without leaving the workbench.

9. Run history UX
- User browses 5 past runs for a pack, clicks one, and views its report artifacts in the center panel.

10. Evidence traceability UX
- User clicks a report section and sees the SQL query + result rows that support it.

11. File search UX
- User types a partial filename and the folder tree filters to matching files across all folders.

12. SQL execution UX
- User opens a `.sql` file, clicks Run, and sees tabular results below the editor.

## Assumptions and Defaults
- This is a UX roadmap document, not an implementation diff.
- Existing auth model (`requireAuth`) remains unchanged.
- Feature-flag rollout is preferred for all UX changes.
- Refresh is immutable by default (new run snapshots, no in-place overwrite).
- File name remains `Future Improvments.md` for now (spelling retained to avoid path churn).
```

## Test Cases and Scenarios
1. File-level check: document is non-empty, markdown-valid, and readable in IDE preview.
2. Coverage check: each sub-skill from `skill-agent-workbench.md` is represented at least once.
3. Traceability check: each UX improvement includes at least one concrete code touchpoint.
4. Consistency check: document references 7-step pipeline where `render_charts` is included.
5. Actionability check: each priority item includes problem + improvement + touchpoints.

## Assumptions and Defaults
1. “This” refers to the UX improvement set from the prior turn.
2. The target file is intentionally the `references/Future Improvments.md` path currently in repo.
3. No code changes are executed in this step; this is documentation planning content ready for write.
