# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gas market data platform. Next.js 15 frontend querying Azure PostgreSQL (ICE cash prices) and Azure SQL (Genscape nominations), with a FastAPI Python backend for pipeline scraper infrastructure.

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
- **Communication:** Next.js API routes query Azure PostgreSQL and Azure SQL directly for reads.

### Frontend Structure
- `frontend/app/` - App Router pages and API routes
- `frontend/app/HomePageClient.tsx` - Main dashboard with section navigation
- `frontend/components/gas/` - Gas market visualization components (GenscapeNomsTable, KrsWatchlistTable, WatchlistEditor, CashBalmoTable, CashPricingMatrix, WxCashBalmoTable, CashAndNomsTable)
- `frontend/components/ui/` - Reusable UI components (MultiSelect)
- `frontend/components/Sidebar.tsx` - Navigation sidebar (Genscape + ICE Cash Prices sections)
- `frontend/lib/db.ts` - PostgreSQL connection pool (ICE cash prices)
- `frontend/lib/mssql.ts` - Azure SQL connection pool (Genscape nominations)
- `frontend/lib/auth-guard.ts` - Auth guard utility for API route protection
- `frontend/lib/watchlists.ts` - Watchlist type definitions
- `frontend/lib/feature-flags.ts` - Feature flags (GENSCAPE_ENABLED, ICE_CASH_ENABLED)
- `frontend/auth.ts` - NextAuth.js v5 with Microsoft Entra ID

### Backend Structure
- `backend/src/api.py` - FastAPI app with `/health` endpoint
- `backend/src/settings.py` - Centralized environment variable loading
- `backend/src/utils/` - Shared utilities (azure_postgresql, logging_utils, etc.)
- `backend/src/scrapers/` - 20 pipeline scraper modules

### Data Flow Patterns
1. **ICE Cash Prices (PostgreSQL):** Frontend API routes (`/api/ice-cash-balmo`, `/api/ice-cash-daily`, `/api/ice-cash-pricing-matrix`, `/api/ice-wx-cash-balmo`) query Azure PostgreSQL via `lib/db.ts`.
2. **Genscape Nominations (Azure SQL):** The `/api/genscape-noms` route queries Azure SQL (GenscapeDataFeed) via `lib/mssql.ts`.
3. **Watchlists (PostgreSQL):** The `/api/watchlists` route manages watchlists stored in Azure PostgreSQL.
4. **Scraper execution:** Scrapers run independently and write to `gas_ebbs.{pipeline}_critical_notices` tables.

### Adding a New Data View
1. Create API route in `frontend/app/api/<name>/route.ts`
2. Create component in `frontend/components/gas/<Name>.tsx`
3. Add section to `SECTION_META` in `HomePageClient.tsx`
4. Add nav item to `Sidebar.tsx` `TOP_SECTIONS`

### API Routes
- `GET /api/genscape-noms` — Genscape nominations data
- `GET /api/genscape-noms/filters` — Filter options for nominations
- `GET /api/ice-cash-balmo` — ICE cash vs balance-of-month
- `GET /api/ice-cash-daily` — Daily ICE cash prices
- `GET /api/ice-cash-pricing-matrix` — ICE pricing matrix
- `GET /api/ice-wx-cash-balmo` — Weather-adjusted ICE cash data
- `GET /api/watchlists` — List/create watchlists
- `GET /api/watchlists/[watchlistId]` — Get/update/delete watchlist

## Key Conventions

- All frontend components use `"use client"` - interactive client-side rendering
- All API routes use `requireAuth()` from `@/lib/auth-guard` for authentication (skipped in local dev when `AUTH_MICROSOFT_ENTRA_ID_ID` is not set)
- Dark theme throughout: backgrounds `#0f1117`, `#0b0d14`, `#12141d`; borders `gray-800`; text `gray-100`/`gray-500`
- Each scraper is self-contained: parse logic varies per pipeline since each EBB portal has different HTML
- Upsert strategy: Temp table COPY + INSERT ON CONFLICT on primary key

## Import Convention (Backend)

```python
from src.utils import logging_utils, azure_postgresql
from src.scrapers.{pipeline} import settings
```

## Environment Variables

Frontend (`frontend/.env.local`): `AZURE_POSTGRESQL_DB_HOST`, `AZURE_POSTGRESQL_DB_PORT`, `AZURE_POSTGRESQL_DB_USER`, `AZURE_POSTGRESQL_DB_PASSWORD`, `AZURE_SQL_DB_HOST`, `AZURE_SQL_DB_PORT`, `AZURE_SQL_DB_NAME`, `AZURE_SQL_DB_USER`, `AZURE_SQL_DB_PASSWORD`, `PYTHON_API_URL`, NextAuth vars (`AUTH_MICROSOFT_ENTRA_ID_*`, `ALLOWED_EMAILS`)

Feature flags (frontend): `NEXT_PUBLIC_GENSCAPE_ENABLED`, `NEXT_PUBLIC_ICE_CASH_ENABLED` (both default to `true`)

Backend (`backend/src/.env`): `AZURE_POSTGRESQL_DB_HOST`, `AZURE_POSTGRESQL_DB_PORT`, `AZURE_POSTGRESQL_DB_NAME`, `AZURE_POSTGRESQL_DB_USER`, `AZURE_POSTGRESQL_DB_PASSWORD`, `AZURE_SQL_DB_HOST`, `AZURE_SQL_DB_PORT`, `AZURE_SQL_DB_NAME`, `AZURE_SQL_DB_USER`, `AZURE_SQL_DB_PASSWORD`
