# Progress Bar — Agent Pipeline Step Visualization

## Overview

Horizontal step progress bar that visualizes the 6-step analysis pipeline in the workbench center panel. Shows real-time status of each step with polling, tooltips, and retry support.

## Pipeline Steps

| Order | Step Name | Label | Description |
|-------|-----------|-------|-------------|
| 1 | `load_inputs` | Load Inputs | Verify required input files exist in the workspace |
| 2 | `execute_sql` | Execute SQL | Run SQL queries against PostgreSQL and Azure SQL |
| 3 | `compute_metrics` | Compute Metrics | Calculate deltas and statistics from SQL results |
| 4 | `build_context` | Build Context | Assemble analysis document from SQL results and metrics |
| 5 | `generate_report` | Generate Report | Create structured JSON report via Claude |
| 6 | `evidence_link` | Evidence Link | Link report sections to source SQL runs |

## Visual Design

Six circle nodes connected by horizontal lines. Each node reflects its step status:

| Status | Node | Icon | Label | Animation |
|--------|------|------|-------|-----------|
| `pending` | gray-800 bg, gray-600 border | (empty) | gray-600 | none |
| `running` | cyan-900/60 bg, cyan-400 border | (empty) | cyan-400 | pulse glow |
| `completed` | emerald-900/60 bg, emerald-400 border | checkmark | emerald-400 | none |
| `failed` | red-900/60 bg, red-400 border | X mark | red-400 | none |
| `skipped` | gray-800 bg, dashed gray-600 border | dash | gray-600 | none |

**Connector lines** fill left-to-right: emerald for completed segments, cyan gradient at the running edge, gray for pending.

**Tooltip on hover:** step name, status pill, duration (computed from `started_at`/`completed_at`), retry count if > 0, error excerpt if failed.

**Click on failed node:** triggers retry callback.

## Files

### New Files

| File | Purpose |
|------|---------|
| `frontend/lib/step-meta.ts` | Step display metadata — maps `StepName` → `{ label, shortLabel, description }` |
| `frontend/hooks/useRunPoller.ts` | Polls `GET /api/analysis-runs/[runId]` every 3s while run is active; stops on terminal status |
| `frontend/components/workbench/StepProgressBar.tsx` | Main progress bar component |

### Modified Files

| File | Change |
|------|--------|
| `frontend/tailwind.config.ts` | Add `step-pulse` keyframe animation |
| `frontend/app/workbench/[workspaceId]/WorkbenchClient.tsx` | Integrate bar between toolbar and content area when `runId` URL param is present |

## Component API

```typescript
interface StepProgressBarProps {
  // Controlled mode — parent provides data
  steps?: PackRunStep[];
  run?: PackRun | null;

  // Polling mode — component fetches its own data
  runId?: number | null;
  pollInterval?: number;       // default 3000ms

  // Callbacks
  onRetryStep?: (stepName: StepName) => void;
  onStepClick?: (step: PackRunStep) => void;

  // Layout
  compact?: boolean;           // shorter labels, smaller nodes
  className?: string;
}
```

Two usage modes:
1. **Controlled:** parent passes `steps` + `run` (no internal polling)
2. **Polling:** parent passes `runId`, component uses `useRunPoller` internally

## Polling Hook

```typescript
interface UseRunPollerOptions {
  runId: number | null;
  enabled?: boolean;           // default true
  intervalMs?: number;         // default 3000
}

interface UseRunPollerReturn {
  run: PackRun | null;
  steps: PackRunStep[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}
```

- Polls while `run.status` is `pending` or `running`
- Stops automatically on `completed`, `failed`, or `finalized`
- Uses `AbortController` for cleanup on unmount
- Exposes `refetch()` for manual refresh after actions like retry

## Integration Point

In `WorkbenchClient.tsx`, the bar renders in the center panel between the toolbar and content area:

```
Top bar
├── Left panel (260px) │ Center panel (flex-1)          │ Right panel (350px)
│   FolderExplorer     │ Toolbar                        │ WorkbenchChat
│                      │ ┌─────────────────────────┐    │
│                      │ │ StepProgressBar          │ ◄──── NEW
│                      │ └─────────────────────────┘    │
│                      │ Content area                   │
```

Activated by URL param: `/workbench/[workspaceId]?runId=<id>`

## Existing Types (reuse)

All from `frontend/lib/types/analysis.ts`:
- `StepName`, `StepStatus`, `RunStatus`
- `PackRunStep`, `PackRun`
- `PACK_STEPS` (ordered step array)

## Existing API Endpoints (reuse)

- `GET /api/analysis-runs/[runId]` — returns `{ run, steps, artifact_paths }`
- `POST /api/analysis-runs/[runId]/retry-step` — resets failed step to pending
- `POST /api/analysis-runs/[runId]/execute-step` — executes a single step

## Implementation Order

1. `frontend/lib/step-meta.ts`
2. `frontend/hooks/useRunPoller.ts`
3. `frontend/components/workbench/StepProgressBar.tsx`
4. `frontend/tailwind.config.ts` — add animation
5. `frontend/app/workbench/[workspaceId]/WorkbenchClient.tsx` — integrate
