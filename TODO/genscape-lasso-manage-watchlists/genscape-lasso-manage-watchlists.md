# Genscape Lasso → Watchlist Import

## Status: In Progress (2026-03-14)

## Goal

Allow users to create watchlists from location IDs captured via the Genscape/WoodMac lasso tool (DevTools Network tab capture).

## What Was Built

### New files
- **`frontend/lib/extract-location-ids.ts`** — Utility that parses JSON text, recursively extracts all `locationId` fields, deduplicates in insertion order. Includes `ExtractionError` class for validation (empty input, malformed JSON, zero IDs found).
- **`frontend/lib/__tests__/extract-location-ids.test.ts`** — 10 unit tests (vitest) covering flat arrays, dedup, nested objects, string coercion, the real sample data, and all error cases.

### Modified files
- **`frontend/components/gas/WatchlistEditor.tsx`** — Added "Import from Lasso" section in the create/edit form:
  - File upload (`.json`, `.yaml`, `.yml`, `.txt`) via hidden `<input type="file">`
  - Paste textarea with "Extract IDs" button
  - Purple-bordered preview table showing Pipeline, Location Name, and Location ID after import
  - Clear button to discard import
  - All state resets properly on new/cancel/select
- **`frontend/package.json`** — Added `vitest` devDependency, `test` and `test:watch` scripts.

### Validation
- `npm run test` — 10/10 pass
- `npm run lint` — clean
- `npm run build` — compiles successfully

## Known Issue: `locationId` vs `location_role_id` Mismatch

### The problem

The lasso import **does not produce working watchlists**. Watchlists created from the imported IDs show 0 rows on the Watchlists data page.

**Root cause:** The Genscape/WoodMac lasso output contains a `locationId` field. This maps to the `location_id` column in the Azure SQL table (`noms_v1_2026_jan_02.source_v1_genscape_noms`). However, the entire watchlist system — storage, API queries, and the data table — filters on `location_role_id`, which is a **different column**.

### DB schema (relevant columns)

```
source_v1_genscape_noms
├── location_id          ← what the lasso exports as "locationId"
├── location_role_id     ← what watchlists filter on
├── pipeline_short_name
├── loc_name
├── facility
├── role
└── ...
```

A single `location_id` can map to **multiple** `location_role_id` values (one per role at that location, e.g. receipt vs delivery).

### Data flow today

```
Lasso output (locationId: 442494)
        ↓
extractLocationIds() → [442494, 442454, ...]
        ↓
Stored in watchlist as location_role_ids: [442494, 442454, ...]
        ↓
KrsWatchlistTable queries: WHERE location_role_id IN (442494, ...)
        ↓
0 rows — these are location_id values, not location_role_id values
```

### Sample data

From `krs-cig-watchlist.yaml` (the lasso capture):
```json
[
  { "pipelineShortName": "CIG", "locationName": "CO/KN ST LINE TO LAKIN CS", "locationId": 442494 },
  { "pipelineShortName": "CIG", "locationName": "DOVER TO WELD COUNTY LAT", "locationId": 442454 },
  { "pipelineShortName": "CIG", "locationName": "KN/OK ST LINE TO BAKER MS", "locationId": 442496 },
  { "pipelineShortName": "CIG", "locationName": "(TXSC) TEXAS SOUTH", "locationId": 442500 },
  { "pipelineShortName": "CIG", "locationName": "(WMCC) WAMSUTTER COMPRESSOR", "locationId": 442373 }
]
```

## Proposed Fix: Resolve `location_id` → `location_role_id` at Import Time

### Option A: Server-side lookup API (recommended)

Add an API endpoint or extend `/api/genscape-noms/filters` to accept `locationIds` (note: not `locationRoleIds`) and return the corresponding `location_role_id` values from the noms table.

```
GET /api/genscape-noms/filters?locationIds=442494,442454,442496,442500,442373
→ { location_role_ids: [<resolved IDs>], pipelines: [...], loc_names: [...] }
```

SQL:
```sql
SELECT DISTINCT location_role_id
FROM noms_v1_2026_jan_02.source_v1_genscape_noms
WHERE location_id IN (442494, 442454, 442496, 442500, 442373)
```

**After extraction**, the frontend calls this endpoint to resolve `locationId[]` → `location_role_id[]`, then populates the watchlist with the resolved IDs. The preview table could also show the resolved role IDs alongside the location names.

### Option B: Client-side — store `location_id` and change query layer

Would require changing the watchlist schema and all downstream queries to support filtering by `location_id` instead of (or in addition to) `location_role_id`. Much larger blast radius — not recommended.

## Files Reference

```
frontend/lib/extract-location-ids.ts          # extraction utility
frontend/lib/__tests__/extract-location-ids.test.ts  # tests
frontend/components/gas/WatchlistEditor.tsx    # UI (import + preview)
frontend/app/api/watchlists/route.ts           # POST creates watchlist
frontend/app/api/genscape-noms/filters/route.ts  # filter/lookup API (needs locationIds support)
frontend/app/api/genscape-noms/route.ts        # data API (queries by location_role_id)
frontend/components/gas/KrsWatchlistTable.tsx   # data table (displays by location_role_id)
frontend/lib/watchlists.ts                     # Watchlist type
```
