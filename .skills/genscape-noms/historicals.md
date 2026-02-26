# Genscape Noms Historicals - Implementation Plan

Last updated: 2026-02-26

This document describes the full implementation plan for adding **historical Genscape nominations data** to the helioscta-gas-frontend application. It covers the database layer, backend API, frontend components, data flow, and an ordered checklist of implementation steps.

---

## Table of Contents

1. [Database Layer](#1-database-layer)
2. [Backend API Endpoints (FastAPI)](#2-backend-api-endpoints-fastapi)
3. [Frontend: Next.js API Routes](#3-frontend-nextjs-api-routes)
4. [Frontend Components](#4-frontend-components)
5. [Data Flow](#5-data-flow)
6. [Implementation Steps](#6-implementation-steps)

---

## 1. Database Layer

### 1.1 Connection Utilities

The project uses two parallel database connection strategies (mirroring the helioscta-pjm-da reference repo):

**Backend (Python / FastAPI):** `backend/src/utils/azure_postgresql.py`
- Uses `psycopg2` to connect to Azure PostgreSQL (`helioscta` database)
- Reads credentials from environment variables:
  - `AZURE_POSTGRESQL_DB_HOST` (e.g., `heliosctadb.postgres.database.azure.com`)
  - `AZURE_POSTGRESQL_DB_USER`
  - `AZURE_POSTGRESQL_DB_PASSWORD`
  - `AZURE_POSTGRESQL_DB_PORT` (default `5432`)
- Provides `_connect_to_azure_postgresql()` (connection factory), `pull_from_db()` (read queries), and `upsert_to_azure_postgresql()` (temp-table COPY + INSERT ON CONFLICT pattern)
- Copy this utility from the PJM DA backend at `C:/Users/AidanKeaveny/Documents/github/helioscta-pjm-da/backend/src/utils/azure_postgresql.py` (it is the improved version with input validation on `_get_query_create_table` and `_get_query_upsert`)

**Frontend (TypeScript / Next.js):** `frontend/lib/db.ts`
- Uses the `pg` npm package (`Pool` from `pg`)
- Singleton pool with hot-reload safety (`globalThis._pgPool`)
- SSL enabled with `rejectUnauthorized: false` for Azure
- Same env vars as above, pool max = 5 connections
- Exports a `query<T>(sql, params?)` function used by all API route handlers
- Copy directly from `C:/Users/AidanKeaveny/Documents/github/helioscta-pjm-da/frontend/lib/db.ts`

### 1.2 Expected Schema / Table Structure

Genscape tracks pipeline nominations (scheduled quantities) across gas day cycles. The data is expected to reside in the `helioscta` database under a `genscape` schema. Based on standard Genscape nomination data fields and the column hints in the existing `azure_postgresql.py` CREATE TABLE comment (`gas_day`, `cycle_code`, `scheduled_cap`, `operational_cap`, `available_cap`, `design_cap`), the expected table structure is:

**Schema:** `genscape`
**Table:** `genscape.nominations` (or `genscape.noms_historical`)

```sql
CREATE TABLE IF NOT EXISTS genscape.nominations (
    -- Identity / key columns
    id                  SERIAL,
    pipeline_name       VARCHAR(200)    NOT NULL,
    location_name       VARCHAR(200),
    location_id         VARCHAR(50),
    gas_day             DATE            NOT NULL,
    cycle_code          VARCHAR(20)     NOT NULL,   -- e.g., 'Timely', 'Evening', 'Intraday1', 'Intraday2', 'Intraday3', 'Final'

    -- Nomination quantities (Dth/day)
    scheduled_quantity  NUMERIC(18,2),              -- total scheduled nominations
    design_capacity     NUMERIC(18,2),              -- pipeline design capacity at this point
    operational_capacity NUMERIC(18,2),             -- current operational capacity
    available_capacity  NUMERIC(18,2),              -- remaining available capacity
    total_scheduled     NUMERIC(18,2),              -- may differ from scheduled_quantity if aggregated

    -- Flow direction / role
    flow_direction      VARCHAR(20),                -- 'Receipt', 'Delivery', or null for net
    role_code           VARCHAR(20),                -- e.g., 'Shipper', 'Operator'

    -- Metadata
    units               VARCHAR(20)     DEFAULT 'Dth',
    data_source         VARCHAR(50)     DEFAULT 'Genscape',
    update_timestamp    TIMESTAMP,                  -- when Genscape last updated this record
    scraped_at          TIMESTAMP,                  -- when our ETL ingested it

    -- Audit columns (auto-managed by upsert utility)
    created_at          TIMESTAMPTZ     DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton'),
    updated_at          TIMESTAMPTZ     DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton'),

    -- Primary key: unique nomination per pipeline + location + gas_day + cycle
    PRIMARY KEY (pipeline_name, gas_day, cycle_code, COALESCE(location_name, ''))
);

-- Index for fast date-range queries filtered by pipeline
CREATE INDEX IF NOT EXISTS idx_noms_pipeline_gasday
    ON genscape.nominations (pipeline_name, gas_day DESC);

-- Index for pipeline listing
CREATE INDEX IF NOT EXISTS idx_noms_pipeline_name
    ON genscape.nominations (pipeline_name);
```

**IMPORTANT:** The exact schema must be validated against the actual Genscape data feed once database access is available. The columns above are a best-guess based on:
- The `_get_query_create_table` comment in `azure_postgresql.py` (shows `gas_day`, `cycle_code`, `operational_cap`, `available_cap`, `scheduled_cap`, `design_cap`, `role_code`, `units`, `location_role_id`)
- Standard NAESB/Genscape nomination data models
- The 210 pipeline names from `.skills/genscape_pipelines.md`

### 1.3 SQL Queries for Historical Data Retrieval

**Query 1: Historical nominations with filters**

```sql
-- DATA_SQL: Historical nominations filtered by pipeline(s), date range, and optional cycle
SELECT
    pipeline_name,
    gas_day,
    cycle_code,
    scheduled_quantity,
    design_capacity,
    operational_capacity,
    available_capacity,
    flow_direction,
    units,
    update_timestamp
FROM genscape.nominations
WHERE pipeline_name = ANY($1::varchar[])          -- array of pipeline names
  AND gas_day >= $2::date                          -- start date
  AND gas_day <= $3::date                          -- end date
  AND ($4::varchar IS NULL OR cycle_code = $4)     -- optional cycle filter
ORDER BY gas_day DESC, pipeline_name, cycle_code
LIMIT $5;
```

**Query 2: List distinct pipelines**

```sql
-- PIPELINES_SQL: All pipelines with data in the nominations table
SELECT DISTINCT pipeline_name
FROM genscape.nominations
ORDER BY pipeline_name;
```

**Query 3: List distinct cycles**

```sql
-- CYCLES_SQL: All nomination cycles present in the data
SELECT DISTINCT cycle_code
FROM genscape.nominations
ORDER BY cycle_code;
```

**Query 4: Aggregated daily summary (for chart visualization)**

```sql
-- DAILY_SUMMARY_SQL: Aggregated scheduled quantity by pipeline + gas_day
-- (takes the latest cycle per day for each pipeline)
WITH latest_cycle AS (
    SELECT DISTINCT ON (pipeline_name, gas_day)
        pipeline_name,
        gas_day,
        cycle_code,
        scheduled_quantity,
        design_capacity,
        operational_capacity,
        available_capacity
    FROM genscape.nominations
    WHERE pipeline_name = ANY($1::varchar[])
      AND gas_day >= $2::date
      AND gas_day <= $3::date
    ORDER BY pipeline_name, gas_day,
        CASE cycle_code
            WHEN 'Final' THEN 1
            WHEN 'Intraday3' THEN 2
            WHEN 'Intraday2' THEN 3
            WHEN 'Intraday1' THEN 4
            WHEN 'Evening' THEN 5
            WHEN 'Timely' THEN 6
            ELSE 7
        END
)
SELECT * FROM latest_cycle
ORDER BY gas_day DESC, pipeline_name;
```

---

## 2. Backend API Endpoints (FastAPI)

The backend is a FastAPI application running in Docker (matching the PJM DA pattern). The backend provides computed/analytical endpoints. For pure database reads, the Next.js frontend API routes query PostgreSQL directly via `lib/db.ts`.

**File:** `backend/src/api.py`

### 2.1 Endpoint: GET /api/genscape/pipelines

Returns the list of all pipelines that have nomination data.

```python
@app.get("/api/genscape/pipelines")
def get_genscape_pipelines():
    """Return distinct pipeline names from the Genscape nominations table."""
    query = """
        SELECT DISTINCT pipeline_name
        FROM genscape.nominations
        ORDER BY pipeline_name
    """
    df = pull_from_db(query)
    if df is None or df.empty:
        return {"pipelines": []}
    return {"pipelines": df["pipeline_name"].tolist()}
```

**Response schema:**
```json
{
  "pipelines": ["Algonquin Gas Transmission, LLC", "ANR Pipeline", "..."]
}
```

### 2.2 Endpoint: GET /api/genscape/noms/historical

Returns historical nomination data with filtering. This endpoint may be implemented at the Next.js API route level instead (see Section 3) since it is a straightforward DB read. The FastAPI version would be useful if Python-side data transformations or aggregations are needed.

```python
@app.get("/api/genscape/noms/historical")
def get_genscape_noms_historical(
    pipelines: str = Query(..., description="Comma-separated pipeline names"),
    start_date: date = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: date = Query(..., description="End date (YYYY-MM-DD)"),
    cycle: Optional[str] = Query(None, description="Cycle code filter (Timely, Evening, etc.)"),
    limit: int = Query(10000, ge=1, le=50000, description="Max rows to return"),
):
    """Fetch historical Genscape nomination data with filters."""
    pipeline_list = [p.strip() for p in pipelines.split(",") if p.strip()]
    if not pipeline_list:
        raise HTTPException(status_code=400, detail="At least one pipeline is required")

    # Build parameterized query
    placeholders = ", ".join([f"${i+1}" for i in range(len(pipeline_list))])
    params = pipeline_list + [str(start_date), str(end_date)]

    cycle_clause = ""
    if cycle:
        cycle_clause = f"AND cycle_code = ${len(params) + 1}"
        params.append(cycle)

    params.append(limit)

    query = f"""
        SELECT pipeline_name, gas_day, cycle_code,
               scheduled_quantity, design_capacity,
               operational_capacity, available_capacity,
               flow_direction, units, update_timestamp
        FROM genscape.nominations
        WHERE pipeline_name IN ({placeholders})
          AND gas_day >= ${len(pipeline_list) + 1}::date
          AND gas_day <= ${len(pipeline_list) + 2}::date
          {cycle_clause}
        ORDER BY gas_day DESC, pipeline_name, cycle_code
        LIMIT ${len(params)}
    """

    df = pull_from_db(query)  # uses psycopg2 under the hood
    if df is None:
        raise HTTPException(status_code=500, detail="Database query failed")

    return {
        "rows": df.to_dict(orient="records"),
        "total": len(df),
        "filters": {
            "pipelines": pipeline_list,
            "start_date": str(start_date),
            "end_date": str(end_date),
            "cycle": cycle,
        }
    }
```

**Response schema:**
```json
{
  "rows": [
    {
      "pipeline_name": "Transcontinental Gas Pipe Line Corporation",
      "gas_day": "2026-02-25",
      "cycle_code": "Timely",
      "scheduled_quantity": 5234000,
      "design_capacity": 7800000,
      "operational_capacity": 7500000,
      "available_capacity": 2266000,
      "flow_direction": null,
      "units": "Dth",
      "update_timestamp": "2026-02-25T14:30:00"
    }
  ],
  "total": 150,
  "filters": {
    "pipelines": ["Transcontinental Gas Pipe Line Corporation"],
    "start_date": "2026-01-01",
    "end_date": "2026-02-25",
    "cycle": null
  }
}
```

### 2.3 Backend Settings

**File:** `backend/src/settings.py` (add or confirm these env vars)

```python
AZURE_POSTGRESQL_DB_HOST = os.getenv("AZURE_POSTGRESQL_DB_HOST")
AZURE_POSTGRESQL_DB_PORT = os.getenv("AZURE_POSTGRESQL_DB_PORT", "5432")
AZURE_POSTGRESQL_DB_NAME = os.getenv("AZURE_POSTGRESQL_DB_NAME", "helioscta")
AZURE_POSTGRESQL_DB_USER = os.getenv("AZURE_POSTGRESQL_DB_USER")
AZURE_POSTGRESQL_DB_PASSWORD = os.getenv("AZURE_POSTGRESQL_DB_PASSWORD")
```

---

## 3. Frontend: Next.js API Routes

Following the PJM DA pattern, the frontend Next.js app has its own API routes that query PostgreSQL directly for simple reads. This avoids an extra network hop through FastAPI for straightforward SELECT queries.

### 3.1 Route: `frontend/app/api/genscape/noms/historical/route.ts`

```typescript
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const DATA_SQL = `
  SELECT
    pipeline_name,
    gas_day,
    cycle_code,
    scheduled_quantity,
    design_capacity,
    operational_capacity,
    available_capacity,
    flow_direction,
    units
  FROM genscape.nominations
  WHERE pipeline_name = ANY($1::varchar[])
    AND gas_day >= $2::date
    AND gas_day <= $3::date
    AND ($4::varchar IS NULL OR cycle_code = $4)
  ORDER BY gas_day DESC, pipeline_name, cycle_code
  LIMIT 10000
`;

const PIPELINES_SQL = `
  SELECT DISTINCT pipeline_name
  FROM genscape.nominations
  ORDER BY pipeline_name
`;

const CYCLES_SQL = `
  SELECT DISTINCT cycle_code
  FROM genscape.nominations
  ORDER BY cycle_code
`;

function toISODate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Parse pipeline names (comma-separated)
  const pipelinesRaw = searchParams.get("pipelines") || "";
  const pipelines = pipelinesRaw.split(",").map(p => p.trim()).filter(Boolean);
  if (pipelines.length === 0) {
    return NextResponse.json(
      { error: "At least one pipeline name is required" },
      { status: 400 }
    );
  }

  // Parse date range
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultEnd = tomorrow.toISOString().slice(0, 10);
  const endDate = toISODate(searchParams.get("end")) ?? defaultEnd;

  let startDate = toISODate(searchParams.get("start"));
  if (!startDate) {
    const daysRaw = parseInt(searchParams.get("days") || "90", 10);
    const days = Number.isFinite(daysRaw) && daysRaw > 0
      ? Math.min(daysRaw, 730) : 90;
    const d = new Date(endDate);
    d.setDate(d.getDate() - days);
    startDate = d.toISOString().slice(0, 10);
  }

  // Optional cycle filter
  const cycle = searchParams.get("cycle") || null;

  try {
    const [dataRes, pipelinesRes, cyclesRes] = await Promise.all([
      query(DATA_SQL, [pipelines, startDate, endDate, cycle]),
      query(PIPELINES_SQL),
      query(CYCLES_SQL),
    ]);

    return NextResponse.json(
      {
        rows: dataRes.rows,
        pipelines: pipelinesRes.rows.map(
          (r) => (r as { pipeline_name: string }).pipeline_name
        ),
        cycles: cyclesRes.rows.map(
          (r) => (r as { cycle_code: string }).cycle_code
        ),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("[genscape-noms-historical] DB query failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch Genscape nomination data" },
      { status: 500 }
    );
  }
}
```

### 3.2 Route: `frontend/app/api/genscape/pipelines/route.ts`

A lightweight endpoint to get just the pipeline list (useful for initial dropdown population without fetching data).

```typescript
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const PIPELINES_SQL = `
  SELECT DISTINCT pipeline_name
  FROM genscape.nominations
  ORDER BY pipeline_name
`;

export async function GET() {
  try {
    const result = await query(PIPELINES_SQL);
    return NextResponse.json({
      pipelines: result.rows.map(
        (r) => (r as { pipeline_name: string }).pipeline_name
      ),
    });
  } catch (error) {
    console.error("[genscape-pipelines] DB query failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch pipeline list" },
      { status: 500 }
    );
  }
}
```

---

## 4. Frontend Components

### 4.1 Component: `GenscapeNomsHistorical.tsx`

**File:** `frontend/components/gas/GenscapeNomsHistorical.tsx`

This component follows the PJM DA `PjmLmpsHourlyTable.tsx` pattern: filter bar at top, Recharts line chart in the middle, data table at the bottom. It uses the same dark theme color palette.

#### 4.1.1 Type Definitions

```typescript
interface NomRow {
  pipeline_name: string;
  gas_day: string;
  cycle_code: string;
  scheduled_quantity: number | null;
  design_capacity: number | null;
  operational_capacity: number | null;
  available_capacity: number | null;
  flow_direction: string | null;
  units: string;
}

type MetricColumn =
  | "scheduled_quantity"
  | "design_capacity"
  | "operational_capacity"
  | "available_capacity";
```

#### 4.1.2 Filter Controls

Located at the top of the component, wrapped in a `flex flex-wrap items-end gap-4` container:

| Filter | Control Type | Description |
|--------|-------------|-------------|
| **Pipeline** | Multi-select dropdown with search | Searchable list of ~210 pipelines. User can select multiple. Uses a custom `<MultiSelect>` component or a combobox pattern. Shows selected count as badge. |
| **Start Date** | `<input type="date">` | Defaults to 90 days before end date. |
| **End Date** | `<input type="date">` | Defaults to tomorrow. |
| **Days** | `<input type="number">` | Convenience input; changing it recalculates start date. |
| **Cycle** | `<select>` dropdown | Options: "All Cycles", "Timely", "Evening", "Intraday1", "Intraday2", "Intraday3", "Final". Populated from the `cycles` array in the API response. |
| **Metric** | `<select>` dropdown | Which numeric column to display in chart/heatmap: Scheduled Quantity, Design Capacity, Operational Capacity, Available Capacity. |
| **Apply** | `<button>` | Commits input state to fetch state, triggering a new API call. |

**Styling:** All inputs use `rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:border-gray-500 focus:outline-none` (matching PJM DA).

#### 4.1.3 Multi-Select Pipeline Dropdown

Because there are ~210 pipelines, a standard `<select multiple>` is inadequate. Implement a custom dropdown:

- Text input at top for search/filter (filters pipeline list as user types)
- Scrollable checkbox list below (max-height ~300px)
- "Select All" / "Clear All" buttons
- Badge showing count of selected pipelines
- Closes on click-outside
- Renders as a button showing "3 pipelines selected" or the single name if only one selected

Consider using a headless UI library (Headless UI `Combobox` or Radix `Select`) or implementing a simple custom component.

#### 4.1.4 Chart Section

Uses Recharts `<LineChart>` inside a `<ResponsiveContainer>` (same as PJM DA). Wrapped in the dark card: `rounded-xl border border-gray-800 bg-[#0f1117] p-4`.

- **X-axis:** `gas_day` (dates)
- **Y-axis:** Selected metric (e.g., scheduled_quantity in Dth)
- **Lines:** One line per selected pipeline, each with a distinct color from the highlight palette (`#dc2626`, `#2563eb`, `#16a34a`, `#f59e0b`, `#8b5cf6`, `#ec4899`, `#14b8a6`, `#f97316`)
- **Tooltip:** Custom tooltip showing the date, all pipeline values at that date, sorted descending by value
- **Legend:** Date chips below the chart for toggling line visibility (same pattern as PJM DA)
- **Data preparation:** Group by `(pipeline_name, gas_day)`, using the latest cycle for each day (or the user-selected cycle if filtered). Build chart entries as `{ gas_day, [pipeline_name]: value, ... }`.

#### 4.1.5 Data Table

Pivot table below the chart, wrapped in `overflow-x-auto rounded-xl border border-gray-800`:

**Columns:**
| Column | Description |
|--------|-------------|
| Gas Day | Date, sticky left column, white text |
| Pipeline Name | Pipeline identifier |
| Cycle | Cycle code |
| Scheduled Qty | Right-aligned, formatted with commas |
| Design Cap | Right-aligned, formatted with commas |
| Operational Cap | Right-aligned, formatted with commas |
| Available Cap | Right-aligned, formatted with commas |
| Utilization % | Computed: `(scheduled_quantity / operational_capacity) * 100`, shown as percentage |

**Table features:**
- Sticky header row
- Alternating row backgrounds: `bg-[#0f1117]` and `bg-[#12141d]`
- Hover: `hover:bg-gray-800/30`
- Heatmap gradient on utilization %: `bg-red-900/30` for > 85%, `bg-orange-900/20` for > 70%, `bg-blue-900/30` for < 15%
- Sortable columns (click header to toggle ASC/DESC)
- Client-side date multi-select chips above the table (same pattern as PJM DA table dates)
- Number formatting: `toLocaleString()` for thousands separators

#### 4.1.6 State Management

```
State Variables:
  -- Input state (controlled inputs, not yet applied) --
  pipelinesInput: string[]        -- selected pipeline names
  startInput: string              -- start date string
  endInput: string                -- end date string
  daysInput: string               -- days lookback string
  cycleInput: string | null       -- cycle filter or null for all
  metricInput: MetricColumn       -- which metric to chart/highlight

  -- Applied state (triggers fetch) --
  pipelines: string[]
  startDate: string
  endDate: string
  cycle: string | null

  -- Data state --
  data: NomRow[]
  availablePipelines: string[]    -- from API response
  availableCycles: string[]       -- from API response
  loading: boolean
  error: string | null

  -- UI state --
  visiblePipelines: Set<string>   -- which pipelines are visible on chart
  sortColumn: string | null
  sortDirection: 'asc' | 'desc'
  tableDates: Set<string> | null  -- client-side table date filter
```

### 4.2 Integration into Sidebar and HomePageClient

#### 4.2.1 Sidebar.tsx

**File:** `frontend/components/Sidebar.tsx`

Add the `ActiveSection` type and `NAV_SECTIONS` entries:

```typescript
// Add to ActiveSection type union:
export type ActiveSection =
  | "dashboard"
  | "genscape-noms-historical"
  // ... other sections
  ;

// Add a new nav section:
const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", iconPath: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1m-4 0h4", iconColor: "text-emerald-400" },
    ],
  },
  {
    title: "Genscape",
    items: [
      {
        id: "genscape-noms-historical",
        label: "Noms Historical",
        // Chart/trending icon
        iconPath: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
        iconColor: "text-blue-400",
      },
    ],
  },
  // ... other sections (Pipeline EBBs, etc.)
];
```

The sidebar header should display `Helios CTA` and the footer should say `Source: Azure PostgreSQL`. The branding subtitle in the main content area should say `Helios CTA | Gas Markets` instead of `Helios CTA | Power Markets`.

#### 4.2.2 HomePageClient.tsx

**File:** `frontend/app/HomePageClient.tsx`

```typescript
import GenscapeNomsHistorical from "@/components/gas/GenscapeNomsHistorical";

const SECTION_META: Record<ActiveSection, { title: string; subtitle: string; footer: string }> = {
  "dashboard": {
    title: "Dashboard",
    subtitle: "Real-time overview of gas market indicators.",
    footer: "Dashboard | Source: Azure PostgreSQL",
  },
  "genscape-noms-historical": {
    title: "Genscape Noms Historical",
    subtitle: "Historical pipeline nomination data from Genscape across ~210 US natural gas pipelines.",
    footer: "Genscape Nominations | Source: Azure PostgreSQL (genscape.nominations)",
  },
  // ... other sections
};

// In the render, add the conditional:
{activeSection === "genscape-noms-historical" && <GenscapeNomsHistorical />}
```

### 4.3 Component File Structure

```
frontend/
  components/
    gas/
      GenscapeNomsHistorical.tsx     -- Main component
      MultiSelectDropdown.tsx         -- Reusable multi-select dropdown for pipelines
    Sidebar.tsx                       -- Updated with gas nav sections
  app/
    HomePageClient.tsx                -- Updated with genscape section
    api/
      genscape/
        noms/
          historical/
            route.ts                  -- Next.js API route for historical noms
        pipelines/
          route.ts                    -- Next.js API route for pipeline list
  lib/
    db.ts                             -- PostgreSQL connection pool (copied from PJM DA)
```

### 4.4 Theme Constants

All components should use these consistent dark theme values (from PJM DA reference):

```
Background (page):       #0b0d14
Background (card):       #0f1117
Background (alt row):    #12141d
Background (input):      bg-gray-800
Border:                  border-gray-700, border-gray-800
Text (primary):          text-white, text-gray-100
Text (secondary):        text-gray-300, text-gray-400
Text (muted):            text-gray-500, text-gray-600
Tooltip bg:              bg-[#1f2937]
Chart grid:              stroke="#1f2937"
Highlight colors:        #dc2626, #2563eb, #16a34a, #f59e0b, #8b5cf6, #ec4899, #14b8a6, #f97316
```

---

## 5. Data Flow

The full data flow follows the same pattern as helioscta-pjm-da:

```
[Azure PostgreSQL]                    [Docker: Backend]              [Docker: Frontend]
 helioscta DB                          FastAPI (port 8000)            Next.js (port 3000)
 genscape.nominations                  /api/genscape/...              /api/genscape/...
        |                                     |                              |
        |  (psycopg2 for write/ETL)           |                              |
        |<----- pull_from_db() ---------------|                              |
        |                                     |                              |
        |  (pg Pool for read queries)         |                              |
        |<------------------------------------------------------ query() ---|
        |                                     |                              |
                                              |   (PYTHON_API_URL)           |
                                              |<---- fetch() proxy ---------|
                                              |     (only for compute-      |
                                              |      heavy endpoints)       |
```

### Detailed Flow for a Page Load

1. **User opens Genscape Noms Historical page** in the browser
2. **React component mounts** (`GenscapeNomsHistorical.tsx`), triggers `useEffect` with default filters
3. **Browser fetches** `GET /api/genscape/noms/historical?pipelines=Transco&days=90`
4. **Next.js API route** (`app/api/genscape/noms/historical/route.ts`) receives the request
5. **API route calls** `query(DATA_SQL, [...])` from `lib/db.ts`, which uses the `pg` Pool to connect directly to Azure PostgreSQL
6. **PostgreSQL returns** the result set (filtered nomination rows + distinct pipelines + distinct cycles)
7. **API route serializes** to JSON and returns `NextResponse.json({ rows, pipelines, cycles })`
8. **React component receives** JSON, updates `data`, `availablePipelines`, `availableCycles` state
9. **Component renders:**
   - Filter bar with populated dropdowns
   - Recharts `<LineChart>` with one line per visible pipeline
   - Sortable data table with heatmap utilization coloring

### When FastAPI Backend Is Needed

The FastAPI backend (Python) should only be used for endpoints that require:
- Complex data transformations (e.g., statistical analysis, aggregations beyond SQL)
- Machine learning model inference
- Integration with other Python ETL utilities

For the historical noms feature, **the Next.js API route querying PostgreSQL directly is sufficient** since the data retrieval is a straightforward filtered SELECT. The FastAPI endpoints described in Section 2 serve as an alternative if Python-side processing is later needed (e.g., anomaly detection on nomination patterns).

---

## 6. Implementation Steps

Ordered checklist. Dependencies are noted in parentheses.

### Phase 1: Infrastructure

- [ ] **1.1** Create the `frontend/` directory structure (copy Next.js scaffold from helioscta-pjm-da)
  - `frontend/package.json` with dependencies: `next`, `react`, `react-dom`, `recharts`, `pg`, `tailwindcss`, `postcss`, `autoprefixer`
  - `frontend/tsconfig.json`
  - `frontend/tailwind.config.ts`
  - `frontend/next.config.ts`
  - `frontend/postcss.config.mjs`
  - `frontend/app/layout.tsx`
  - `frontend/app/globals.css` (Tailwind base with dark theme)

- [ ] **1.2** Create the `backend/` directory structure (copy FastAPI scaffold from helioscta-pjm-da)
  - `backend/src/__init__.py`
  - `backend/src/api.py` (FastAPI app with CORS, health endpoint)
  - `backend/src/settings.py` (env var loading)
  - `backend/src/utils/azure_postgresql.py` (copy from PJM DA backend)
  - `backend/requirements.txt` (fastapi, uvicorn, psycopg2-binary, pandas, python-dotenv)
  - `backend/Dockerfile`

- [ ] **1.3** Create `frontend/lib/db.ts` (copy from PJM DA, identical pattern)

- [ ] **1.4** Create `docker-compose.yml` at repo root (copy from PJM DA, update service names/ports)
  - Backend on port 8000
  - Frontend on port 7654 (or another port to avoid collisions)
  - Environment variable pass-through for PostgreSQL credentials

- [ ] **1.5** Create `.env` / `.env.local` template files (DO NOT commit actual credentials)
  - `backend/src/.env` for Python backend
  - `frontend/.env.local` for Next.js

### Phase 2: Database Discovery

- [ ] **2.1** Verify the Genscape nominations table exists in the `helioscta` database
  - Connect to `heliosctadb.postgres.database.azure.com` and run:
    ```sql
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_name ILIKE '%genscape%' OR table_name ILIKE '%nom%'
    ORDER BY table_schema, table_name;
    ```
  - Document the actual schema name, table name, and column names

- [ ] **2.2** Inspect the actual table schema
  - Run `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '...' AND table_schema = '...'`
  - Update the SQL queries in Section 1.3 and Section 3 to match the real column names

- [ ] **2.3** Verify data completeness
  - Check `SELECT COUNT(*), MIN(gas_day), MAX(gas_day) FROM genscape.nominations`
  - Check `SELECT COUNT(DISTINCT pipeline_name) FROM genscape.nominations`
  - Confirm the 210 pipelines from `.skills/genscape_pipelines.md` are represented

### Phase 3: API Routes

- [ ] **3.1** Implement `frontend/app/api/genscape/pipelines/route.ts` (depends on 1.3, 2.2)

- [ ] **3.2** Implement `frontend/app/api/genscape/noms/historical/route.ts` (depends on 1.3, 2.2)
  - Include parameterized SQL with pipeline array, date range, optional cycle filter
  - Return `{ rows, pipelines, cycles }`
  - Add 5-minute cache header

- [ ] **3.3** Test API routes locally
  - `curl "http://localhost:3000/api/genscape/pipelines"`
  - `curl "http://localhost:3000/api/genscape/noms/historical?pipelines=Transcontinental%20Gas%20Pipe%20Line%20Corporation&days=30"`

### Phase 4: Frontend Components

- [ ] **4.1** Create `frontend/components/gas/MultiSelectDropdown.tsx`
  - Searchable, scrollable, checkbox-based multi-select
  - Props: `options: string[]`, `selected: string[]`, `onChange: (selected: string[]) => void`, `placeholder: string`

- [ ] **4.2** Create `frontend/components/gas/GenscapeNomsHistorical.tsx` (depends on 3.2, 4.1)
  - Filter bar with pipeline multi-select, date range, cycle, metric
  - `useEffect` fetch to `/api/genscape/noms/historical`
  - Data pivot logic in `useMemo`
  - Recharts `<LineChart>` with pipeline lines
  - Data table with heatmap, sorting, sticky headers

- [ ] **4.3** Update `frontend/components/Sidebar.tsx`
  - Add `"genscape-noms-historical"` to `ActiveSection` type
  - Add "Genscape" nav section with "Noms Historical" item
  - Update branding to "Gas Markets"

- [ ] **4.4** Update `frontend/app/HomePageClient.tsx`
  - Import `GenscapeNomsHistorical`
  - Add section metadata to `SECTION_META`
  - Add conditional render for the section

- [ ] **4.5** Create or update `frontend/app/page.tsx` to render `HomePageClient`

### Phase 5: Integration Testing

- [ ] **5.1** Run `docker-compose up --build` and verify both services start
- [ ] **5.2** Navigate to the frontend in the browser, switch to "Noms Historical" in sidebar
- [ ] **5.3** Verify pipeline dropdown loads all ~210 pipelines
- [ ] **5.4** Select a pipeline, verify chart and table render with real data
- [ ] **5.5** Test multi-pipeline selection (3+ pipelines), verify chart has distinct colored lines
- [ ] **5.6** Test cycle filter changes
- [ ] **5.7** Test date range edge cases (very large range, single day, future dates)
- [ ] **5.8** Test table sorting on all columns
- [ ] **5.9** Verify heatmap coloring on utilization % column
- [ ] **5.10** Test responsive behavior on smaller viewports

### Phase 6: Polish

- [ ] **6.1** Add loading skeleton/spinner during data fetch
- [ ] **6.2** Add empty state message when no data matches filters
- [ ] **6.3** Add error boundary with retry button
- [ ] **6.4** Add CSV export button for the filtered data table
- [ ] **6.5** Ensure proper number formatting (thousands separators, 2 decimal places)
- [ ] **6.6** Add keyboard navigation support for multi-select dropdown
- [ ] **6.7** Performance optimization: debounce search input in multi-select, virtualize table rows if > 500

---

## Appendix A: Pipeline Names Reference

The full list of ~210 Genscape-tracked pipeline names is maintained in `.skills/genscape_pipelines.md`. Key high-volume pipelines to use for initial testing:

1. Transcontinental Gas Pipe Line Corporation (Transco)
2. Tennessee Gas Pipeline
3. Texas Eastern Transmission Co
4. ANR Pipeline
5. Columbia Gas Transmission
6. El Paso Natural Gas
7. Natural Gas Pipeline Company of America, LLC (NGPL)
8. Northern Natural Gas Pipeline
9. Panhandle Eastern Pipeline Company
10. Rockies Express

## Appendix B: Cycle Code Reference

Standard NAESB gas nomination cycles (in order of the gas day):

| Cycle | Typical Deadline | Description |
|-------|-----------------|-------------|
| Timely | 11:30 AM CCT, Day-1 | First nomination window |
| Evening | 6:00 PM CCT, Day-1 | Evening update window |
| Intraday1 | 10:00 AM CCT, Gas Day | First intraday update |
| Intraday2 | 2:30 PM CCT, Gas Day | Second intraday update |
| Intraday3 | 7:00 PM CCT, Gas Day | Third intraday update |
| Final | After Gas Day | Final reconciled values |

## Appendix C: Dependencies

**Frontend (package.json)**
```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.12.0",
    "pg": "^8.12.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.0",
    "@types/react": "^19.0.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "typescript": "^5.6.0"
  }
}
```

**Backend (requirements.txt)**
```
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
psycopg2-binary>=2.9.0
pandas>=2.2.0
numpy>=1.26.0
python-dotenv>=1.0.0
pytz>=2024.1
```
