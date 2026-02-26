# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gas pipeline analytics platform. Next.js 15 frontend with FastAPI Python backend, both querying Azure PostgreSQL. Scrapes critical notices (Force Majeure, OFO, Maintenance) from 20 US natural gas pipeline EBB (Electronic Bulletin Board) portals and displays them in a web dashboard.

## Commands

### Frontend (from `frontend/`)
```bash
npx next dev -p 2222   # Dev server on localhost:2222
npm run build           # Production build
npm run lint            # ESLint check
npm run lint:fix        # ESLint auto-fix
```

### Backend (from `backend/`)
```bash
uvicorn src.api:app --reload --port 1111   # Dev server on localhost:1111
```

### Full Stack (from repo root)
```bash
docker compose up --build   # Both services via Docker
```

### Run a single pipeline scraper (from `backend/`)
```bash
python -m src.scrapers.transco.transco_critical_notices
```

## Architecture

### Two-Service Design
- **Frontend:** Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS + Recharts
- **Backend:** FastAPI (Python 3.12) + BeautifulSoup + pandas
- **Communication:** Next.js API routes query Azure PostgreSQL directly for reads. Scraper-triggering endpoints proxy to FastAPI via `PYTHON_API_URL`.

### Frontend Structure
- `frontend/app/` - App Router pages and API routes
- `frontend/components/gas/` - Gas pipeline visualization components (Dashboard, CriticalNoticesTable, PipelineStatusGrid, GenscapeNomsTable)
- `frontend/components/Sidebar.tsx` - Navigation sidebar
- `frontend/lib/db.ts` - PostgreSQL connection pool (used by API routes for direct DB queries)
- `frontend/lib/mssql.ts` - Azure SQL connection pool (used by Genscape Noms API route)
- `frontend/auth.ts` - NextAuth.js v5 with Microsoft Entra ID

### Backend Structure
- `backend/src/api.py` - FastAPI app with endpoints: `/health`, `/api/gas-ebbs/pipelines`, `/api/gas-ebbs/critical-notices`, `/api/gas-ebbs/dashboard`, `/api/gas-ebbs/scraper-status`
- `backend/src/settings.py` - Centralized environment variable loading
- `backend/src/utils/` - Shared utilities (azure_postgresql, logging_utils, etc.)
- `backend/src/scrapers/` - 20 pipeline scraper modules, each with: `{pipeline}_critical_notices.py`, `settings.py`, `__init__.py`

### Pipelines
algonquin, anr, columbia_gas, el_paso, florida_gas, gulf_south, iroquois, millennium, mountain_valley, ngpl, northern_natural, northwest, panhandle_eastern, rex, rover, southeast_supply, southern_pines, texas_eastern, tgp, transco

### Data Flow Patterns
1. **Direct DB queries (PostgreSQL):** Most frontend API routes (`/api/dashboard`, `/api/gas-ebbs-critical-notices`, `/api/gas-ebbs-pipelines`) query Azure PostgreSQL directly using the `pg` pool from `lib/db.ts`.
2. **Direct DB queries (Azure SQL):** The `/api/genscape-noms` route queries Azure SQL (GenscapeDataFeed) using the `mssql` pool from `lib/mssql.ts`.
3. **Scraper execution:** Scrapers run independently (via scheduler or manually) and write to `gas_ebbs.{pipeline}_critical_notices` tables.

### Adding a New Data View
1. Create API route in `frontend/app/api/<name>/route.ts`
2. Create component in `frontend/components/gas/<Name>.tsx`
3. Add section to `SECTION_META` in `HomePageClient.tsx`
4. Add nav item to `Sidebar.tsx` `NAV_SECTIONS`

### Adding a New Pipeline Scraper
1. Create directory under `backend/src/scrapers/{pipeline_name}/`
2. Add `__init__.py`, `settings.py`, `{pipeline_name}_critical_notices.py`
3. Follow the existing pattern: `fetch_page()` -> `parse_critical_notices()` -> `run_scraper()` -> `_upsert()` -> `main()`
4. Target table: `gas_ebbs.{pipeline_name}_critical_notices` with `notice_identifier` as primary key
5. Add pipeline to `PIPELINES` list in `backend/src/api.py` and frontend API routes

## Key Conventions

- All frontend components use `"use client"` - interactive client-side rendering
- Dark theme throughout: backgrounds `#0f1117`, `#0b0d14`, `#12141d`; borders `gray-800`; text `gray-100`/`gray-500`
- Pipeline table names validated against allow-list to prevent SQL injection
- Each scraper is self-contained: parse logic varies per pipeline since each EBB portal has different HTML
- Upsert strategy: Temp table COPY + INSERT ON CONFLICT on primary key
- Database schema: `gas_ebbs`, tables: `gas_ebbs.{pipeline}_critical_notices`

## Import Convention (Backend)

```python
from src.utils import logging_utils, azure_postgresql
from src.scrapers.{pipeline} import settings
```

## Environment Variables

Frontend (`frontend/.env.local`): `AZURE_POSTGRESQL_DB_HOST`, `AZURE_POSTGRESQL_DB_PORT`, `AZURE_POSTGRESQL_DB_USER`, `AZURE_POSTGRESQL_DB_PASSWORD`, `AZURE_SQL_DB_HOST`, `AZURE_SQL_DB_PORT`, `AZURE_SQL_DB_NAME`, `AZURE_SQL_DB_USER`, `AZURE_SQL_DB_PASSWORD`, `PYTHON_API_URL`, NextAuth vars (`AUTH_MICROSOFT_ENTRA_ID_*`, `ALLOWED_EMAILS`)

Backend (`backend/src/.env`): `AZURE_POSTGRESQL_DB_HOST`, `AZURE_POSTGRESQL_DB_PORT`, `AZURE_POSTGRESQL_DB_NAME`, `AZURE_POSTGRESQL_DB_USER`, `AZURE_POSTGRESQL_DB_PASSWORD`, `AZURE_SQL_DB_HOST`, `AZURE_SQL_DB_PORT`, `AZURE_SQL_DB_NAME`, `AZURE_SQL_DB_USER`, `AZURE_SQL_DB_PASSWORD`
