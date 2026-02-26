# Gas EBB Frontend + Backend Refactoring Plan

Reference architecture: `helioscta-pjm-da`
Target repo: `helioscta-gas-frontend`

---

## 1. Target Directory Structure

```
helioscta-gas-frontend/
├── docker-compose.yml
├── CLAUDE.md
├── README.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── pyproject.toml
│   ├── environment.yml
│   │
│   └── src/
│       ├── .env                              # DB creds, Slack tokens (single source)
│       ├── api.py                            # FastAPI app with CORS
│       ├── settings.py                       # Loads .env, exposes DB + Slack vars
│       │
│       ├── utils/
│       │   ├── __init__.py
│       │   ├── azure_postgresql.py           # Moved from current utils/
│       │   ├── logging_utils.py              # Moved from current utils/
│       │   ├── slack_utils.py                # Moved from current utils/
│       │   ├── file_utils.py                 # Moved from current utils/
│       │   ├── azure_blob_storage_utils.py   # Moved from current utils/
│       │   ├── azure_email_utils.py          # Moved from current utils/
│       │   └── html_utils_single_dashboard.py # Moved from current utils/
│       │
│       └── scrapers/
│           ├── __init__.py
│           ├── algonquin/
│           │   ├── __init__.py
│           │   ├── settings.py               # Pipeline-specific URLs, cache dir
│           │   └── algonquin_critical_notices.py
│           ├── anr/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── anr_critical_notices.py
│           ├── columbia_gas/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── columbia_gas_critical_notices.py
│           ├── el_paso/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── el_paso_critical_notices.py
│           ├── florida_gas/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── florida_gas_critical_notices.py
│           ├── gulf_south/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── gulf_south_critical_notices.py
│           ├── iroquois/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── iroquois_critical_notices.py
│           ├── millennium/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── millennium_critical_notices.py
│           ├── mountain_valley/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── mountain_valley_critical_notices.py
│           ├── ngpl/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── ngpl_critical_notices.py
│           ├── northern_natural/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── northern_natural_critical_notices.py
│           ├── northwest/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── northwest_critical_notices.py
│           ├── panhandle_eastern/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── panhandle_eastern_critical_notices.py
│           ├── rex/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── rex_critical_notices.py
│           ├── rover/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── rover_critical_notices.py
│           ├── southeast_supply/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── southeast_supply_critical_notices.py
│           ├── southern_pines/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── southern_pines_critical_notices.py
│           ├── texas_eastern/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── texas_eastern_critical_notices.py
│           ├── tgp/
│           │   ├── __init__.py
│           │   ├── settings.py
│           │   └── tgp_critical_notices.py
│           └── transco/
│               ├── __init__.py
│               ├── settings.py
│               └── transco_critical_notices.py
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   ├── next.config.ts
│   ├── eslint.config.mjs
│   ├── .env.local                            # DB creds, NextAuth secrets, PYTHON_API_URL
│   ├── .gitignore
│   ├── auth.ts                               # NextAuth.js v5 + Microsoft Entra ID
│   ├── middleware.ts                          # Auth guard for all pages
│   │
│   ├── lib/
│   │   └── db.ts                             # PostgreSQL connection pool (pg library)
│   │
│   ├── app/
│   │   ├── globals.css                       # Tailwind + dark theme CSS vars
│   │   ├── layout.tsx                        # Root layout with dark bg
│   │   ├── page.tsx                          # Server component wrapping HomePageClient
│   │   ├── HomePageClient.tsx                # Client component: sidebar + section routing
│   │   │
│   │   ├── login/
│   │   │   └── page.tsx                      # Microsoft sign-in page
│   │   │
│   │   └── api/
│   │       ├── auth/
│   │       │   └── [...nextauth]/
│   │       │       └── route.ts              # NextAuth API route
│   │       │
│   │       ├── dashboard/
│   │       │   └── route.ts                  # Dashboard KPI + summary queries
│   │       │
│   │       ├── gas-ebbs-pipelines/
│   │       │   └── route.ts                  # List all pipelines + latest scrape stats
│   │       │
│   │       ├── gas-ebbs-critical-notices/
│   │       │   └── route.ts                  # Query critical notices with filters
│   │       │
│   │       └── gas-ebbs-scraper-status/
│   │           └── route.ts                  # Per-pipeline scraper health/status
│   │
│   └── components/
│       ├── Sidebar.tsx                       # Navigation sidebar for gas sections
│       │
│       └── gas/
│           ├── Dashboard.tsx                 # Overview KPI cards + charts
│           ├── CriticalNoticesTable.tsx       # Filterable notice table per pipeline
│           ├── PipelineSelector.tsx           # Dropdown/chip selector for pipelines
│           ├── PipelineStatusGrid.tsx         # Grid showing all pipeline scraper status
│           └── NoticeTypeFilter.tsx           # Filter by FM/OFO/Maintenance
│
└── schedulers/                               # Preserved from current repo
    └── task_scheduler_azurepostgresql/
        └── gas_ebbs/
            ├── algonquin_critical_notices.ps1
            ├── anr_critical_notices.ps1
            ├── ... (all 20 pipeline .ps1 files)
            └── register_all_tasks.ps1
```

---

## 2. Backend Setup

### 2.1 Restructuring Existing Python Code

The current code lives at:
```
helioscta_api_scrapes_gas_ebbs/helioscta_api_scrapes_gas_ebbs/{pipeline}/
helioscta_api_scrapes_gas_ebbs/helioscta_api_scrapes_gas_ebbs/utils/
```

This double-nested structure must be flattened into:
```
backend/src/scrapers/{pipeline}/
backend/src/utils/
```

**Import path changes** -- Every file currently uses:
```python
from helioscta_api_scrapes_gas_ebbs.helioscta_api_scrapes_gas_ebbs.utils import (
    logging_utils, slack_utils, azure_postgresql,
)
from helioscta_api_scrapes_gas_ebbs.helioscta_api_scrapes_gas_ebbs.{pipeline} import settings
```

These must change to:
```python
from src.utils import logging_utils, slack_utils, azure_postgresql
from src.scrapers.{pipeline} import settings
```

**Per-pipeline settings.py changes:**
- Currently each pipeline `settings.py` loads its own `.env` via `load_dotenv(dotenv_path=CONFIG_DIR / ".env")`.
- After refactoring, pipeline-specific settings should only contain URLs and pipeline-specific constants (MAIN_PAGE_URL, BASE_URL, CACHE_DIR, SLACK_CHANNEL_NAME).
- DB credentials and Slack bot tokens come from `backend/src/settings.py`, which loads the single `backend/src/.env`.
- Each pipeline `settings.py` should import shared DB/Slack settings from `src.settings` for any env vars that were previously loaded from per-pipeline `.env` files.

**azure_postgresql.py changes:**
- Currently loads DB creds inline via `load_dotenv()` at module level.
- After refactoring: import from `src.settings` (matching the PJM DA pattern where `src.utils.azure_postgresql` imports from `src.settings`).
- Change `from dotenv import load_dotenv; load_dotenv(); AZURE_POSTGRESQL_DB_HOST=os.getenv(...)` to `from src import settings`.
- All functions that reference `AZURE_POSTGRESQL_DB_HOST` etc. should use `settings.AZURE_POSTGRESQL_DB_HOST`.

**slack_utils.py changes:**
- Same pattern: remove inline `load_dotenv()` and `SLACK_BOT_TOKEN = os.getenv(...)`.
- Import from `src.settings` instead.

**azure_blob_storage_utils.py changes:**
- Same pattern: remove inline credential loading, import from `src.settings`.

### 2.2 FastAPI API Endpoints

Create `backend/src/api.py` modeled after the PJM DA `api.py`:

```python
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from src.utils import azure_postgresql
import logging

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="Helios CTA - Gas EBBs API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Endpoints to implement:**

| Endpoint | Method | Description |
|---|---|---|
| `GET /health` | GET | Returns `{"status": "ok"}` |
| `GET /api/gas-ebbs/pipelines` | GET | Returns list of all 20 pipeline names with metadata (display name, table name, last scraped timestamp, notice count) |
| `GET /api/gas-ebbs/critical-notices` | GET | Query notices. Params: `pipeline` (required), `notice_type` (optional: FM/OFO/Maintenance), `start_date`, `end_date`, `limit`, `offset` |
| `GET /api/gas-ebbs/critical-notices/{notice_identifier}` | GET | Get single notice detail |
| `GET /api/gas-ebbs/dashboard` | GET | Aggregated stats: total notices per pipeline, recent notices across all pipelines, notices by type breakdown |
| `GET /api/gas-ebbs/scraper-status` | GET | For each pipeline: last `scraped_at`, row count, last `updated_at` |
| `POST /api/gas-ebbs/scrape/{pipeline}` | POST | Trigger an on-demand scrape for a specific pipeline (calls `run_scraper()` + `_upsert()`) |

**Implementation notes for `/api/gas-ebbs/critical-notices`:**
- Uses `azure_postgresql.pull_from_db()` to query `gas_ebbs.{pipeline}_critical_notices`.
- Returns JSON with `rows`, `total_count`, `pipeline`, `filters_applied`.
- SQL: `SELECT * FROM gas_ebbs.{pipeline}_critical_notices WHERE ... ORDER BY posted_datetime DESC LIMIT $n OFFSET $m`.

**Implementation notes for `/api/gas-ebbs/pipelines`:**
```python
PIPELINES = [
    {"id": "algonquin", "display_name": "Algonquin Gas Transmission", "table": "algonquin_critical_notices"},
    {"id": "anr", "display_name": "ANR Pipeline", "table": "anr_critical_notices"},
    {"id": "columbia_gas", "display_name": "Columbia Gas Transmission", "table": "columbia_gas_critical_notices"},
    {"id": "el_paso", "display_name": "El Paso Natural Gas", "table": "el_paso_critical_notices"},
    {"id": "florida_gas", "display_name": "Florida Gas Transmission", "table": "florida_gas_critical_notices"},
    {"id": "gulf_south", "display_name": "Gulf South Pipeline", "table": "gulf_south_critical_notices"},
    {"id": "iroquois", "display_name": "Iroquois Gas Transmission", "table": "iroquois_critical_notices"},
    {"id": "millennium", "display_name": "Millennium Pipeline", "table": "millennium_critical_notices"},
    {"id": "mountain_valley", "display_name": "Mountain Valley Pipeline", "table": "mountain_valley_critical_notices"},
    {"id": "ngpl", "display_name": "Natural Gas Pipeline of America", "table": "ngpl_critical_notices"},
    {"id": "northern_natural", "display_name": "Northern Natural Gas", "table": "northern_natural_critical_notices"},
    {"id": "northwest", "display_name": "Northwest Pipeline", "table": "northwest_critical_notices"},
    {"id": "panhandle_eastern", "display_name": "Panhandle Eastern", "table": "panhandle_eastern_critical_notices"},
    {"id": "rex", "display_name": "Rockies Express Pipeline", "table": "rex_critical_notices"},
    {"id": "rover", "display_name": "Rover Pipeline", "table": "rover_critical_notices"},
    {"id": "southeast_supply", "display_name": "Southeast Supply Header", "table": "southeast_supply_critical_notices"},
    {"id": "southern_pines", "display_name": "Southern Pines Pipeline", "table": "southern_pines_critical_notices"},
    {"id": "texas_eastern", "display_name": "Texas Eastern Transmission", "table": "texas_eastern_critical_notices"},
    {"id": "tgp", "display_name": "Tennessee Gas Pipeline", "table": "tgp_critical_notices"},
    {"id": "transco", "display_name": "Transcontinental Gas Pipe Line", "table": "transco_critical_notices"},
]
```

### 2.3 Backend settings.py

```python
import os
from dotenv import load_dotenv
from pathlib import Path
import logging

logging.basicConfig(level=logging.DEBUG)

CONFIG_DIR = Path(__file__).parent
load_dotenv(dotenv_path=CONFIG_DIR / ".env", override=False)

# Azure PostgreSQL
AZURE_POSTGRESQL_DB_HOST = os.getenv("AZURE_POSTGRESQL_DB_HOST")
AZURE_POSTGRESQL_DB_PORT = os.getenv("AZURE_POSTGRESQL_DB_PORT")
AZURE_POSTGRESQL_DB_NAME = os.getenv("AZURE_POSTGRESQL_DB_NAME", "helioscta")
AZURE_POSTGRESQL_DB_USER = os.getenv("AZURE_POSTGRESQL_DB_USER")
AZURE_POSTGRESQL_DB_PASSWORD = os.getenv("AZURE_POSTGRESQL_DB_PASSWORD")

# Slack
SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN")
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL")
SLACK_CHANNEL_NAME = os.getenv("SLACK_CHANNEL_NAME", "#test123")

# Azure Blob Storage
AZURE_CONNECTION_STRING = os.getenv("AZURE_CONNECTION_STRING")
AZURE_STORAGE_ACCOUNT_NAME = os.getenv("AZURE_STORAGE_ACCOUNT_NAME")
AZURE_CONTAINER_NAME = os.getenv("AZURE_CONTAINER_NAME")

# Azure Outlook (email)
AZURE_OUTLOOK_CLIENT_ID = os.getenv("AZURE_OUTLOOK_CLIENT_ID")
AZURE_OUTLOOK_TENANT_ID = os.getenv("AZURE_OUTLOOK_TENANT_ID")
AZURE_OUTLOOK_CLIENT_SECRET = os.getenv("AZURE_OUTLOOK_CLIENT_SECRET")
```

### 2.4 Backend Dockerfile

Modeled after PJM DA's `backend/Dockerfile`:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system deps for psycopg2-binary
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ .

EXPOSE 8000

CMD ["uvicorn", "src.api:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 2.5 Backend requirements.txt

```
# db
psycopg2-binary==2.9.10

# python
python-dotenv==1.0.1
numpy
pandas>=2.0.0
pyarrow>=12.0.0
pytz
tabulate
openpyxl>=3.1.0

# api
fastapi>=0.115.0
uvicorn[standard]>=0.34.0

# scraping
requests
beautifulsoup4
lxml

# slack
slack-sdk

# azure
azure-storage-blob>=12.19.0
azure-core>=1.29.0

# testing
pytest>=7.0
pytest-mock
```

### 2.6 Backend pyproject.toml

```toml
[tool.poetry]
name = "helioscta_gas_ebbs_backend"
version = "0.1.0"
description = "Backend API for Helios CTA Gas EBBs"
authors = ["Your Name <your.email@example.com>"]
packages = [{include = "src"}]
exclude = ["*.logs", "*.png", "*.csv", "*.xlsx", "*.xlsm"]

[tool.poetry.dependencies]
python = ">=3.12,<3.13"
fastapi = ">=0.115.0"
uvicorn = {version = ">=0.34.0", extras = ["standard"]}
psycopg2-binary = "==2.9.10"
python-dotenv = "==1.0.1"
pandas = ">=2.0.0"
pyarrow = ">=12.0.0"
pytz = "*"
tabulate = "*"
requests = "*"
beautifulsoup4 = "*"
slack-sdk = "*"

[tool.pytest.ini_options]
testpaths = ["tests"]

[build-system]
requires = ["poetry-core>=1.0.0"]
build-backend = "poetry.core.masonry.api"
```

---

## 3. Frontend Setup

### 3.1 Next.js 15 App Structure

Initialize with the same stack as PJM DA:
- Next.js 15, React 19, Tailwind CSS 3, Recharts
- TypeScript, App Router
- NextAuth.js v5 with Microsoft Entra ID
- `pg` library for direct DB queries from API routes

### 3.2 package.json

```json
{
  "name": "helioscta-gas-ebbs-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  },
  "dependencies": {
    "@types/pg": "^8.11.10",
    "next": "^15.5.12",
    "next-auth": "^5.0.0-beta.30",
    "pg": "^8.13.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.15.0"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3.3.3",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.39.2",
    "eslint-config-next": "^15.5.12",
    "postcss": "^8.5.1",
    "tailwindcss": "^3.4.17",
    "typescript": "^5"
  }
}
```

### 3.3 Dark Theme (matching PJM DA)

`globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #0f1117;
  --foreground: #e5e7eb;
}

body {
  background-color: var(--background);
  color: var(--foreground);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
```

`layout.tsx` body class: `"min-h-screen bg-[#0f1117] text-gray-100 antialiased"`

Key theme tokens (from PJM DA):
- Page background: `#0f1117`
- Sidebar background: `#0b0d14`
- Card/panel background: `bg-gray-900/60` or `#0f1117`
- Alternating table rows: `#0f1117` / `#12141d`
- Borders: `border-gray-800`
- Text primary: `text-gray-100`
- Text secondary: `text-gray-400` / `text-gray-500`
- Text muted: `text-gray-600`

### 3.4 lib/db.ts

Copy directly from PJM DA. Uses `pg` Pool with the same Azure PostgreSQL env vars:
```typescript
import { Pool, QueryResult, QueryResultRow } from "pg";

declare global {
  var _pgPool: Pool | undefined;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function createPool(): Pool {
  return new Pool({
    host: requiredEnv("AZURE_POSTGRESQL_DB_HOST"),
    user: requiredEnv("AZURE_POSTGRESQL_DB_USER"),
    password: requiredEnv("AZURE_POSTGRESQL_DB_PASSWORD"),
    port: Number.parseInt(process.env.AZURE_POSTGRESQL_DB_PORT ?? "5432", 10),
    database: "helioscta",
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
}

const pool: Pool =
  process.env.NODE_ENV === "production"
    ? createPool()
    : (globalThis._pgPool ?? (globalThis._pgPool = createPool()));

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(sql, params);
}
```

### 3.5 Authentication (auth.ts + middleware.ts)

Copy directly from PJM DA. Uses NextAuth v5 with Microsoft Entra ID:
- `auth.ts` -- Microsoft Entra ID provider with tenant-scoped endpoints and email allow-list.
- `middleware.ts` -- Redirects unauthenticated users to `/login` for all routes except `/api/auth`, `/login`, `/_next/*`.

### 3.6 Pages and Sections

**ActiveSection type:**
```typescript
export type ActiveSection =
  | "dashboard"
  | "critical-notices"
  | "pipeline-status"
  | "pipeline-detail";
```

**HomePageClient.tsx section metadata:**

```typescript
const SECTION_META: Record<ActiveSection, { title: string; subtitle: string; footer: string }> = {
  "dashboard": {
    title: "Dashboard",
    subtitle: "Real-time overview of gas pipeline critical notices across all 20 EBB portals.",
    footer: "Gas EBBs Dashboard | Source: Azure PostgreSQL",
  },
  "critical-notices": {
    title: "Critical Notices",
    subtitle: "Force Majeure, OFO, and Maintenance notices from gas pipeline EBB portals.",
    footer: "Gas EBBs Critical Notices | Source: Azure PostgreSQL",
  },
  "pipeline-status": {
    title: "Pipeline Scraper Status",
    subtitle: "Health and status of all 20 gas pipeline scrapers.",
    footer: "Gas EBBs Scraper Status | Source: Azure PostgreSQL",
  },
  "pipeline-detail": {
    title: "Pipeline Detail",
    subtitle: "Detailed view of notices for a specific pipeline.",
    footer: "Gas EBBs Pipeline Detail | Source: Azure PostgreSQL",
  },
};
```

**HomePageClient.tsx rendering logic:**
```tsx
{activeSection === "dashboard" && <Dashboard />}
{activeSection === "critical-notices" && <CriticalNoticesTable />}
{activeSection === "pipeline-status" && <PipelineStatusGrid />}
```

### 3.7 Sidebar Navigation

Modeled after PJM DA's `Sidebar.tsx` pattern:

```typescript
const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", iconColor: "text-emerald-400", iconPath: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1m-4 0h4" },
      { id: "pipeline-status", label: "Scraper Status", iconColor: "text-blue-400", iconPath: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
    ],
  },
  {
    title: "Data",
    items: [
      { id: "critical-notices", label: "Critical Notices", iconColor: "text-yellow-500", iconPath: "M13 10V3L4 14h7v7l9-11h-7z" },
    ],
  },
];
```

The sidebar uses the same collapsible pattern as PJM DA:
- Dark background: `bg-[#0b0d14]`
- Border: `border-r border-gray-800`
- Collapsed width: `w-14`, expanded: `w-56`
- Active state: `bg-gray-800/60 text-white`
- Inactive state: `text-gray-400 hover:bg-gray-800/40 hover:text-gray-200`
- Section headers: `text-[10px] font-semibold uppercase tracking-widest text-gray-600`

### 3.8 Components (`components/gas/`)

#### Dashboard.tsx
Modeled after PJM DA's `components/power/Dashboard.tsx`.

**KPI cards (top row, 4 columns):**
1. **Total Active Notices** -- Count of notices across all pipelines where `end_datetime` is null or in the future.
2. **Force Majeure Count** -- Count where `notice_type` contains "Force Majeure".
3. **OFO Count** -- Count where `notice_type` contains "OFO" or "Operational Flow Order".
4. **Pipelines Reporting** -- Count of distinct pipelines with notices in the last 24 hours.

Each card shows: current value, "vs yesterday" change percentage, last update timestamp.

**Charts (below KPI cards):**
- **Notices by Pipeline (bar chart)** -- Horizontal bar chart showing active notice counts per pipeline. Uses Recharts `BarChart`.
- **Notices Timeline (line chart)** -- Notices posted over time (last 30 days), grouped by `notice_type`. Uses Recharts `LineChart`.
- **Recent Notices Feed** -- Scrollable list of the 20 most recent notices across all pipelines, showing pipeline name, notice type, subject, and posted datetime.

**SQL queries for dashboard API route (`app/api/dashboard/route.ts`):**
```sql
-- Total active notices per pipeline
SELECT 'transco' as pipeline, COUNT(*) as count
FROM gas_ebbs.transco_critical_notices
WHERE end_datetime IS NULL OR end_datetime::timestamp > NOW()
UNION ALL
SELECT 'algonquin' as pipeline, COUNT(*) as count
FROM gas_ebbs.algonquin_critical_notices
WHERE end_datetime IS NULL OR end_datetime::timestamp > NOW()
-- ... (repeat for all 20 pipelines, or dynamically build)

-- Recent notices across all pipelines (last 7 days)
-- Use UNION ALL across all pipeline tables
```

Note: Since the gas EBBs schema stores `posted_datetime` and `end_datetime` as VARCHAR (scraped text), the dashboard queries will need to handle text-to-timestamp parsing. Consider adding a `CAST` or using `posted_datetime::timestamp` where the format allows.

#### CriticalNoticesTable.tsx
Modeled after PJM DA's `PjmLmpsHourlyTable.tsx` pattern (filterable data table).

**Features:**
- Pipeline selector dropdown (all 20 pipelines)
- Notice type filter (All / Force Majeure / OFO / Maintenance)
- Date range filter (start date, end date)
- Search box for subject text
- Sortable columns
- Paginated table with alternating row backgrounds (`#0f1117` / `#12141d`)

**Columns:**
| Column | Width | Notes |
|---|---|---|
| Pipeline | 120px | Display name (shown when viewing "all pipelines") |
| Notice Type | 140px | Color-coded badge: red for FM, orange for OFO, blue for Maintenance |
| Posted | 140px | `posted_datetime` formatted |
| Effective | 140px | `effective_datetime` formatted |
| End | 140px | `end_datetime` formatted |
| Identifier | 100px | `notice_identifier` |
| Subject | flex | Truncated with tooltip |
| Detail | 60px | Link icon to `detail_url` (opens in new tab) |

**Fetch pattern (same as PJM DA):**
```typescript
useEffect(() => {
  const controller = new AbortController();
  setLoading(true);
  fetch(`/api/gas-ebbs-critical-notices?pipeline=${pipeline}&type=${noticeType}&start=${startDate}&end=${endDate}`, {
    signal: controller.signal,
  })
    .then(res => res.json())
    .then(json => setData(json.rows))
    .catch(err => { if (err.name !== "AbortError") setError("Failed to load data"); })
    .finally(() => setLoading(false));
  return () => controller.abort();
}, [pipeline, noticeType, startDate, endDate]);
```

#### PipelineStatusGrid.tsx
Grid of cards (one per pipeline) showing scraper health.

**Per-pipeline card:**
- Pipeline display name
- Last scraped timestamp
- Total notice count in DB
- Status indicator: green (scraped within 2 hours), yellow (2-6 hours), red (>6 hours or error)
- Link to view pipeline detail

#### PipelineSelector.tsx
Reusable dropdown component for selecting a pipeline. Used by CriticalNoticesTable and anywhere else a pipeline filter is needed.

#### NoticeTypeFilter.tsx
Chip-style filter buttons: All | Force Majeure | OFO | Maintenance
Modeled after PJM DA's date toggle chips.

### 3.9 API Routes (Next.js `app/api/`)

These are Next.js server-side API routes that query the DB directly using `lib/db.ts` (same pattern as PJM DA). For scraper-triggering endpoints, they proxy to the Python backend.

#### `app/api/dashboard/route.ts`
- Direct DB query via `lib/db.ts`
- Queries all 20 `gas_ebbs.*_critical_notices` tables for counts and recent notices
- Returns KPI data + chart data
- Cache: `s-maxage=300, stale-while-revalidate=60`

#### `app/api/gas-ebbs-critical-notices/route.ts`
- Direct DB query via `lib/db.ts`
- Params: `pipeline`, `type`, `start`, `end`, `limit`, `offset`, `search`
- SQL: parameterized query against `gas_ebbs.{pipeline}_critical_notices`
- Validates `pipeline` against allowed list to prevent SQL injection
- Returns `{ rows, total_count, pipeline }`

#### `app/api/gas-ebbs-pipelines/route.ts`
- Direct DB query via `lib/db.ts`
- For each pipeline: `SELECT COUNT(*), MAX(scraped_at) FROM gas_ebbs.{pipeline}_critical_notices`
- Returns array of pipeline objects with counts and last scraped times

#### `app/api/gas-ebbs-scraper-status/route.ts`
- Direct DB query via `lib/db.ts`
- Same as pipelines but focused on health metrics
- Returns per-pipeline: `last_scraped_at`, `row_count`, `last_updated_at`, health status

#### `app/api/auth/[...nextauth]/route.ts`
- Standard NextAuth route handler (copy from PJM DA)

### 3.10 Frontend Dockerfile

Copy from PJM DA:
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
```

### 3.11 Frontend .env.local

```
# Database
AZURE_POSTGRESQL_DB_HOST=
AZURE_POSTGRESQL_DB_USER=
AZURE_POSTGRESQL_DB_PASSWORD=
AZURE_POSTGRESQL_DB_PORT=5432

# NextAuth
AUTH_SECRET=
AUTH_MICROSOFT_ENTRA_ID_ID=
AUTH_MICROSOFT_ENTRA_ID_SECRET=
AUTH_MICROSOFT_ENTRA_ID_TENANT_ID=
ALLOWED_EMAILS=

# Python backend URL (for scraper triggers)
PYTHON_API_URL=http://backend:8000
```

---

## 4. Docker Compose

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    ports:
      - "8000:8000"
    env_file:
      - ./backend/src/.env
    environment:
      - PYTHONUNBUFFERED=1
    volumes:
      - ./backend:/app
    command: uvicorn src.api:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "7654:3000"
    env_file:
      - ./frontend/.env.local
    environment:
      - PYTHON_API_URL=http://backend:8000
    volumes:
      - ./frontend:/app
      - /app/node_modules
      - /app/.next
    depends_on:
      - backend
```

Key notes:
- Backend build context is repo root (`.`) so the Dockerfile can `COPY backend/` from root.
- Frontend depends on backend for scraper-triggering API proxy calls.
- Port 7654 on host maps to 3000 in container (matching PJM DA pattern).
- Volume mounts enable hot-reload in development.
- `PYTHON_API_URL=http://backend:8000` lets frontend proxy to backend via Docker network.

---

## 5. Migration Steps (Ordered)

### Phase 1: Backend Skeleton (no scraper logic changes)

1. **Create `backend/` directory** at repo root with `src/`, `src/utils/`, `src/scrapers/`.

2. **Create `backend/src/settings.py`** -- single centralized settings file loading `backend/src/.env`.

3. **Create `backend/src/.env`** -- consolidate all env vars from the scattered per-pipeline `.env` files into one file. Include: DB creds, Slack tokens, Azure Blob creds, Azure Outlook creds.

4. **Copy utils** from `helioscta_api_scrapes_gas_ebbs/helioscta_api_scrapes_gas_ebbs/utils/` to `backend/src/utils/`:
   - `azure_postgresql.py`
   - `logging_utils.py`
   - `slack_utils.py`
   - `file_utils.py`
   - `azure_blob_storage_utils.py`
   - `azure_email_utils.py`
   - `html_utils_single_dashboard.py`
   - `__init__.py`

5. **Update import paths in utils** -- Change all `from helioscta_api_scrapes_gas_ebbs.helioscta_api_scrapes_gas_ebbs.utils import ...` to `from src.utils import ...`. Update `azure_postgresql.py` to import from `src.settings` instead of inline `load_dotenv()`. Same for `slack_utils.py`, `azure_blob_storage_utils.py`.

6. **Copy all 20 pipeline directories** from `helioscta_api_scrapes_gas_ebbs/helioscta_api_scrapes_gas_ebbs/{pipeline}/` to `backend/src/scrapers/{pipeline}/`.

7. **Update import paths in every scraper** -- For each of the 20 `{pipeline}_critical_notices.py` files:
   - Change `from helioscta_api_scrapes_gas_ebbs.helioscta_api_scrapes_gas_ebbs.utils import ...` to `from src.utils import ...`
   - Change `from helioscta_api_scrapes_gas_ebbs.helioscta_api_scrapes_gas_ebbs.{pipeline} import settings` to `from src.scrapers.{pipeline} import settings`

8. **Update per-pipeline settings.py** -- Each pipeline `settings.py` currently does its own `load_dotenv()`. Change them to:
   - Keep only pipeline-specific constants (URLs, CACHE_DIR).
   - Import Slack channel/webhook from the pipeline's own `.env` OR fall back to `src.settings` defaults.
   - Remove DB credential loading (handled by `src.settings` + `azure_postgresql.py`).

9. **Create `backend/src/api.py`** with FastAPI app, CORS middleware, `/health` endpoint, and the data query endpoints described in Section 2.2.

10. **Create `backend/Dockerfile`** and `backend/requirements.txt` and `backend/pyproject.toml`.

11. **Verify backend runs standalone:**
    ```bash
    cd backend
    pip install -r requirements.txt
    uvicorn src.api:app --host 0.0.0.0 --port 8000 --reload
    # Test: curl http://localhost:8000/health
    # Test: curl http://localhost:8000/api/gas-ebbs/pipelines
    ```

### Phase 2: Frontend Scaffold

12. **Create `frontend/` directory** at repo root.

13. **Initialize Next.js project:**
    ```bash
    cd frontend
    npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false
    ```

14. **Install dependencies:**
    ```bash
    npm install pg @types/pg next-auth recharts
    ```

15. **Copy config files from PJM DA** (adapting names/descriptions):
    - `auth.ts` (identical)
    - `middleware.ts` (identical)
    - `next.config.ts` (identical)
    - `postcss.config.mjs` (identical)
    - `tailwind.config.ts` (identical)
    - `tsconfig.json` (identical)

16. **Create `frontend/lib/db.ts`** -- Copy from PJM DA (identical, same DB).

17. **Create `frontend/.env.local`** with DB creds, NextAuth secrets, and `PYTHON_API_URL`.

18. **Create `frontend/app/globals.css`** -- Copy dark theme from PJM DA.

19. **Create `frontend/app/layout.tsx`** -- Root layout with dark background. Update metadata title to "Gas EBBs | Helios CTA".

20. **Create `frontend/app/login/page.tsx`** -- Copy from PJM DA (identical sign-in flow).

21. **Create `frontend/app/api/auth/[...nextauth]/route.ts`** -- Standard NextAuth route.

### Phase 3: Frontend Components

22. **Create `frontend/components/Sidebar.tsx`** -- Gas EBB navigation sections (Dashboard, Scraper Status, Critical Notices).

23. **Create `frontend/app/HomePageClient.tsx`** -- Section routing with SECTION_META.

24. **Create `frontend/app/page.tsx`** -- Suspense wrapper around HomePageClient.

25. **Create `frontend/app/api/dashboard/route.ts`** -- Dashboard data queries.

26. **Create `frontend/app/api/gas-ebbs-critical-notices/route.ts`** -- Notice data query.

27. **Create `frontend/app/api/gas-ebbs-pipelines/route.ts`** -- Pipeline list + stats.

28. **Create `frontend/app/api/gas-ebbs-scraper-status/route.ts`** -- Scraper health.

29. **Create `frontend/components/gas/Dashboard.tsx`** -- KPI cards + charts.

30. **Create `frontend/components/gas/CriticalNoticesTable.tsx`** -- Filterable table.

31. **Create `frontend/components/gas/PipelineStatusGrid.tsx`** -- Scraper health grid.

32. **Create `frontend/components/gas/PipelineSelector.tsx`** -- Pipeline dropdown.

33. **Create `frontend/components/gas/NoticeTypeFilter.tsx`** -- Notice type filter chips.

34. **Create `frontend/Dockerfile`** -- Copy from PJM DA.

### Phase 4: Docker Compose + Integration

35. **Create `docker-compose.yml`** at repo root (as described in Section 4).

36. **Test the full stack:**
    ```bash
    docker-compose up --build
    # Frontend: http://localhost:7654
    # Backend: http://localhost:8000/health
    ```

### Phase 5: Cleanup

37. **Move schedulers** from `helioscta_api_scrapes_gas_ebbs/schedulers/` to repo root `schedulers/`. Update the PowerShell scripts to point to the new Python paths:
    - Old: `helioscta_api_scrapes_gas_ebbs/helioscta_api_scrapes_gas_ebbs/transco/transco_critical_notices.py`
    - New: `backend/src/scrapers/transco/transco_critical_notices.py`
    - Or run via: `python -m src.scrapers.transco.transco_critical_notices` from `backend/` directory.

38. **Remove old directory structure** -- Delete `helioscta_api_scrapes_gas_ebbs/` once all code is confirmed working in `backend/`.

39. **Update CLAUDE.md** to reflect new architecture, commands, and import conventions.

40. **Update root `pyproject.toml`** and `requirements.txt` -- Either remove them (since backend has its own) or make them point to backend.

---

## 6. What Stays, What Moves, What's New

### STAYS (unchanged in purpose, just relocated)

| Current Location | New Location | Notes |
|---|---|---|
| `helioscta_api_scrapes_gas_ebbs/.../utils/azure_postgresql.py` | `backend/src/utils/azure_postgresql.py` | Updated imports to use `src.settings` |
| `helioscta_api_scrapes_gas_ebbs/.../utils/logging_utils.py` | `backend/src/utils/logging_utils.py` | Updated imports to use `src.utils.file_utils` |
| `helioscta_api_scrapes_gas_ebbs/.../utils/slack_utils.py` | `backend/src/utils/slack_utils.py` | Updated imports to use `src.settings` |
| `helioscta_api_scrapes_gas_ebbs/.../utils/file_utils.py` | `backend/src/utils/file_utils.py` | No changes needed |
| `helioscta_api_scrapes_gas_ebbs/.../utils/azure_blob_storage_utils.py` | `backend/src/utils/azure_blob_storage_utils.py` | Updated imports to use `src.settings` |
| `helioscta_api_scrapes_gas_ebbs/.../utils/azure_email_utils.py` | `backend/src/utils/azure_email_utils.py` | Updated imports to use `src.settings` |
| `helioscta_api_scrapes_gas_ebbs/.../utils/html_utils_single_dashboard.py` | `backend/src/utils/html_utils_single_dashboard.py` | No changes needed |
| `helioscta_api_scrapes_gas_ebbs/.../transco/transco_critical_notices.py` | `backend/src/scrapers/transco/transco_critical_notices.py` | Updated imports |
| `helioscta_api_scrapes_gas_ebbs/.../transco/settings.py` | `backend/src/scrapers/transco/settings.py` | Simplified (DB creds from `src.settings`) |
| (repeat for all 20 pipelines) | `backend/src/scrapers/{pipeline}/` | Same pattern |
| `helioscta_api_scrapes_gas_ebbs/schedulers/` | `schedulers/` | Updated Python script paths |

### MOVES (fundamentally restructured)

| What | From | To | Change |
|---|---|---|---|
| Double-nested package structure | `helioscta_api_scrapes_gas_ebbs/helioscta_api_scrapes_gas_ebbs/` | `backend/src/` | Flattened one level |
| Scattered per-pipeline `.env` files | `{pipeline}/.env` (20 files) | `backend/src/.env` (1 file) | Consolidated |
| DB credentials in `azure_postgresql.py` | Inline `load_dotenv()` + `os.getenv()` | `src.settings` import | Centralized |
| Slack credentials in `slack_utils.py` | Inline `load_dotenv()` + `os.getenv()` | `src.settings` import | Centralized |
| `utils/settings.py` (Outlook creds) | Standalone utils settings | Merged into `backend/src/settings.py` | Consolidated |

### NEW (created fresh)

| File | Purpose |
|---|---|
| `docker-compose.yml` | Two-service orchestration (backend + frontend) |
| `backend/Dockerfile` | Python 3.12-slim container for FastAPI |
| `backend/src/api.py` | FastAPI application with CORS, all API endpoints |
| `backend/src/settings.py` | Centralized env var loading |
| `backend/requirements.txt` | Python deps (adds fastapi, uvicorn) |
| `backend/pyproject.toml` | Poetry config |
| `frontend/` (entire directory) | Next.js 15 application |
| `frontend/Dockerfile` | node:20-alpine container |
| `frontend/lib/db.ts` | PostgreSQL connection pool for Next.js |
| `frontend/auth.ts` | NextAuth.js v5 + Microsoft Entra ID |
| `frontend/middleware.ts` | Auth guard |
| `frontend/app/layout.tsx` | Root layout with dark theme |
| `frontend/app/page.tsx` | Server component entry point |
| `frontend/app/HomePageClient.tsx` | Client-side section routing |
| `frontend/app/login/page.tsx` | Microsoft sign-in page |
| `frontend/app/api/auth/[...nextauth]/route.ts` | NextAuth API route |
| `frontend/app/api/dashboard/route.ts` | Dashboard KPI queries |
| `frontend/app/api/gas-ebbs-critical-notices/route.ts` | Notice data endpoint |
| `frontend/app/api/gas-ebbs-pipelines/route.ts` | Pipeline list endpoint |
| `frontend/app/api/gas-ebbs-scraper-status/route.ts` | Scraper health endpoint |
| `frontend/components/Sidebar.tsx` | Gas EBB navigation sidebar |
| `frontend/components/gas/Dashboard.tsx` | Dashboard with KPIs + charts |
| `frontend/components/gas/CriticalNoticesTable.tsx` | Filterable notices table |
| `frontend/components/gas/PipelineStatusGrid.tsx` | Scraper status grid |
| `frontend/components/gas/PipelineSelector.tsx` | Pipeline dropdown |
| `frontend/components/gas/NoticeTypeFilter.tsx` | Notice type filter chips |
| `frontend/package.json` | Next.js 15 + React 19 + Tailwind + Recharts |
| `frontend/tailwind.config.ts` | Tailwind configuration |
| `frontend/tsconfig.json` | TypeScript configuration |
| `frontend/next.config.ts` | Next.js configuration |
| `frontend/globals.css` | Dark theme CSS variables |

### REMOVED (after migration)

| What | Notes |
|---|---|
| `helioscta_api_scrapes_gas_ebbs/` (entire directory) | Replaced by `backend/` |
| Root `requirements.txt` | Replaced by `backend/requirements.txt` |
| Root `pyproject.toml` | Replaced by `backend/pyproject.toml` |
| Root `environment.yml` | Replaced by Docker + requirements.txt |
| Per-pipeline `.env` files (20 files) | Consolidated into `backend/src/.env` |
| `helioscta_api_scrapes_gas_ebbs/synmax/` | Evaluate if needed; if so, move to `backend/src/synmax/` |

---

## 7. Key Design Decisions

### Frontend queries DB directly vs proxying through backend

Following the PJM DA pattern:
- **Data display (read) queries** go directly from Next.js API routes to PostgreSQL via `lib/db.ts`. This avoids unnecessary latency through the Python backend for simple SELECT queries.
- **Scraper triggers and write operations** proxy through the Python backend via `PYTHON_API_URL`. The backend is the only service that runs scrapers and writes to the DB.

### Pipeline table access pattern

Since the gas EBBs schema has 20 separate tables (`gas_ebbs.transco_critical_notices`, `gas_ebbs.algonquin_critical_notices`, etc.), the frontend API routes must:
1. Validate the `pipeline` parameter against a hardcoded allow-list (prevents SQL injection).
2. Dynamically construct the table name: `gas_ebbs.${pipeline}_critical_notices`.
3. Use parameterized queries for all WHERE clause values.

### Shared DB credential single-source

Both `backend/src/.env` and `frontend/.env.local` need the same DB credentials. In Docker Compose, both services get them from their respective env files. For production, these should come from a secrets manager (Azure Key Vault or similar).

### Scraper code preserved as-is

The scraper logic (BeautifulSoup HTML parsing, session management, notice dict construction) is unique per pipeline and should NOT be refactored. Only import paths and settings loading change. The parse logic in each `{pipeline}_critical_notices.py` stays identical.
