# Genscape Noms Caching Strategy

Scope: `/api/genscape-noms` routes only. Other sections (Dashboard, Critical Notices, Pipeline Status) are unaffected.

## Per-route caching recommendations

| Data | Route | Cache? | Where | TTL | Rationale |
|------|-------|--------|-------|-----|-----------|
| Pipeline list | `/api/genscape-noms/filters` (no params) | Yes | sessionStorage | Session lifetime | Rarely changes; fetched once on mount |
| Cascade filters (loc_names, role_ids) | `/api/genscape-noms/filters?pipelines=X,Y` | Yes | sessionStorage | Session lifetime | Keyed by sorted pipeline combo. Survives sidebar navigation |
| Nominations data | `/api/genscape-noms` | No — always fetch | N/A | N/A | Parameterized by user filters; must be fresh |

## sessionStorage key format

All keys use the `genscape-filters:` prefix.

| Key | Value |
|-----|-------|
| `genscape-filters:pipeline-list` | JSON array of pipeline names — `["Pipeline A", "Pipeline B", ...]` |
| `genscape-filters:PIPE_A,PIPE_B` | JSON object — `{ "loc_names": [...], "role_ids": [...] }` |

Cascade keys use the sorted, comma-joined pipeline names (e.g. `genscape-filters:ANR,TRANSCO`).

## Implementation notes

- **Pipeline list:** On mount, check sessionStorage first. If present, use it. Otherwise fetch from API, then write to sessionStorage.
- **Cascade filters:** On pipeline selection change, build the cache key from sorted pipeline names. Check sessionStorage first. If hit, use cached data. Otherwise fetch from API, then write to sessionStorage.
- **Nominations data:** No caching. Always hits the DB via Apply button or date change.
- **Server Cache-Control headers** remain as-is (`s-maxage=3600` for filters, `s-maxage=300` for data).

## Why sessionStorage (not useRef or localStorage)

- `useRef` cache is lost when the component unmounts (e.g. sidebar navigation to another tab), causing redundant DB queries on return.
- `sessionStorage` persists across component unmount/remount within the same browser tab, but clears when the tab closes — no stale data across sessions.
- `localStorage` would persist indefinitely, risking stale filter options if pipelines/locations change server-side.

## Verification checklist

1. Navigate to Genscape Noms, select pipelines — cascade filters load from DB (first time)
2. Switch to Dashboard tab, switch back to Genscape Noms — cascade filters load from sessionStorage (no network request)
3. Open DevTools > Application > Session Storage — verify keys like `genscape-filters:pipeline-list` and `genscape-filters:ANR,TRANSCO`
4. Close tab, reopen — sessionStorage is cleared, fresh fetch on next visit
