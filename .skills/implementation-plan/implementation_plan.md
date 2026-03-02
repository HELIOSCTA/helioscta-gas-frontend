# Shared Workspace — Implementation Plan

## Status: Implemented

All phases have been built and the frontend build passes successfully.

## What Was Built

### Phase 1: Foundation

**Database Migration** — `backend/migrations/003_workspace_tables.sql`
- `helioscta_agents.workspaces` — workspace metadata (slug, display_name, type, agent link)
- `helioscta_agents.workspace_files` — file metadata (name, blob_path, type, source, conversation link)
- Index on `workspace_id` for active files

**Azure Blob Client** — `frontend/lib/blob.ts`
- Lazy-initialized singleton following `lib/db.ts` pattern
- `uploadBlob()`, `downloadBlob()`, `deleteBlob()` exports
- Uses `AZURE_STORAGE_CONNECTION_STRING` and `AZURE_STORAGE_CONTAINER_NAME` env vars

**API Routes:**
| Route | Methods | File |
|-------|---------|------|
| `/api/workspaces` | GET, POST | `frontend/app/api/workspaces/route.ts` |
| `/api/workspaces/[workspaceId]/files` | GET, POST | `frontend/app/api/workspaces/[workspaceId]/files/route.ts` |
| `/api/workspaces/[workspaceId]/files/[fileId]` | GET, PUT, DELETE | `frontend/app/api/workspaces/[workspaceId]/files/[fileId]/route.ts` |
| `/api/workspace/plot` | POST | `frontend/app/api/workspace/plot/route.ts` (proxy to backend) |

**Dependencies Added:**
- `@azure/storage-blob` — blob CRUD
- `codemirror`, `@codemirror/view`, `@codemirror/state`, `@codemirror/commands` — editor core
- `@codemirror/lang-markdown`, `@codemirror/lang-python`, `@codemirror/lang-sql` — language modes
- `@codemirror/theme-one-dark` — dark theme
- `react-markdown`, `remark-gfm` — markdown preview
- `react-plotly.js`, `plotly.js-dist-min` — interactive Plotly charts

### Phase 2: Workspace UI

**Components in `frontend/components/workspace/`:**
| Component | Purpose |
|-----------|---------|
| `WorkspaceExplorer.tsx` | Main two-panel layout with workspace selector, file tree + editor/preview |
| `FileTree.tsx` | File explorer sidebar with type icons, new/upload/delete buttons |
| `FileEditor.tsx` | CodeMirror 6 editor with 2s debounce auto-save, language auto-detection |
| `MarkdownPreview.tsx` | Markdown rendering via react-markdown + remark-gfm |
| `CsvPreview.tsx` | Tabular CSV display with pagination (50 rows/page) |
| `ImageViewer.tsx` | PNG/SVG display for generated plots |
| `PlotGenerator.tsx` | Column selector, chart type picker, generates Plotly charts via backend |

**Navigation Integration:**
- `Sidebar.tsx` — Added `"workspace"` to `ActiveSection` type, emerald folder icon
- `HomePageClient.tsx` — Added workspace section meta + conditional render

### Phase 3: Agent Integration

**Auto-save in `chat/route.ts`:**
- In `onFinish` callback, auto-creates workspace for agent (`slug: agent_{agentId}`)
- Uploads response as markdown to blob storage
- Inserts `workspace_files` metadata with `source = 'agent_output'`
- Non-fatal: errors logged but don't break chat

**Save to Workspace button on `MessageBubble.tsx`:**
- Download icon appears on hover for assistant messages
- Opens modal to pick workspace + filename
- POSTs to `/api/workspaces/{id}/files`

### Phase 4: Backend Plot Generation (Plotly)

**Backend endpoints in `backend/src/api.py`:**
- `POST /api/workspace/plot` — Reads CSV from blob, generates Plotly chart (line/bar/scatter), returns PNG base64 + Plotly JSON + Recharts-compatible data
- `GET /api/workspace/plot-data` — Reads CSV from blob, returns structured JSON columns/data

**Backend dependencies:** `plotly>=5.18.0`, `kaleido>=0.2.1`

**Frontend proxy:** `frontend/app/api/workspace/plot/route.ts` proxies to `PYTHON_API_URL`

**PlotGenerator component:** Interactive Plotly chart via `react-plotly.js`, falls back to static PNG image

## Config Changes

- `next.config.ts` — Added `@azure/storage-blob` to `serverExternalPackages`
- `backend/requirements.txt` — Added `plotly>=5.18.0`, `kaleido>=0.2.1`

## Environment Variables Needed

```
AZURE_STORAGE_CONNECTION_STRING=<connection string>
AZURE_STORAGE_CONTAINER_NAME=helioscta-workspaces
```

## Blob Storage Structure

```
helioscta-workspaces/
  agents/{agent_id}/
    shared/{filename}
    conversations/{conversation_id}/{timestamp}_{filename}
  projects/{project_slug}/
    {filename}
```

## Remaining Setup Steps

1. Run `backend/migrations/003_workspace_tables.sql` against the database
2. Add `AZURE_STORAGE_CONNECTION_STRING` to `frontend/.env.local` and backend `.env`
3. Create the `helioscta-workspaces` blob container in Azure Storage
4. Install backend deps: `pip install plotly kaleido`
