# Data fetching & caching

The path from Azure blob → browser pixel has five cache layers. Use them all.

## The layers

1. **Azure blob** (upstream ETL writes it; we can't change this)
2. **Server in-process row cache** — `readParquet()` in `lib/azure-parquet.ts`,
   15-min TTL, dedupes in-flight requests.
3. **API route response cache** — Vercel edge respects
   `Cache-Control: public, s-maxage=300, stale-while-revalidate=60`.
4. **Browser HTTP cache** — same `Cache-Control`, short TTL, revalidates.
5. **`sessionStorage` (client)** — persists UI state (selected filters,
   date range, region) across page reloads so the user never re-picks.

A request should cache-hit at the highest layer possible. If layer 3 hits, no
server work. If layer 2 hits, no Azure download. Etc.

## API routes — required headers

Every data API route must set:

```ts
return NextResponse.json(payload, {
  headers: {
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
  },
});
```

- `s-maxage=300` = Vercel edge cache holds the response for 5 minutes.
- `stale-while-revalidate=60` = if the cache is 5–6 min old, serve stale
  immediately, refresh in background.

Tune the numbers by dataset freshness: the parquet is refreshed hourly in
our current ETL, so 5 min is a reasonable edge TTL.

## Server in-process cache

`readParquet()` is the authority. Two rules:

- **Do not bypass it** — always route through `readParquet(container, blobPath)`,
  never call `asyncBufferFromUrl` directly from a route. Bypassing means you
  miss the 15-min cache and the in-flight dedup.
- **Tune TTL per dataset via `CACHE_TTL_MS`** — currently global 15 min. If a
  dataset updates more frequently, add a per-dataset TTL override rather than
  lowering the global one.

On Vercel the cache is per-function-instance (serverless). That's fine for
performance (each instance warms once, then serves fast) but means you can't
rely on the cache timestamp as a global signal — see `parquet-pages.md`.

## Client-side fetching

For now, pages use raw `fetch` + `useEffect`. That's OK for simple cases but
has pitfalls: no dedup across mounts, no stale-while-revalidate, refetch
storms on re-render.

When a page has more than one dependent query, or the user navigates
back-and-forth between views, use **SWR** (already common on Vercel stack):

```tsx
import useSWR from "swr";

const { data, isLoading } = useSWR(
  `/api/pjm/load-forecast?${params}`,
  (url) => fetch(url).then((r) => r.json()),
  { revalidateOnFocus: false, dedupingInterval: 60_000 }
);
```

Benefits you get "for free":
- Deduped requests across components
- Stale data shown instantly on revisit
- Background revalidation
- Error retries

If you introduce SWR, do it consistently — don't mix raw fetch and SWR on the
same page.

## sessionStorage for UI state

Already used in `PjmLoadForecast` and `PjmLmpPrices`. Pattern:

```ts
const [startDate, setStartDate] = useState(
  () => cacheGet<string>("start") ?? todayStr()
);
useEffect(() => { cacheSet("start", startDate); }, [startDate]);
```

Use it for: selected filters, date ranges, active view mode, expanded rows.
Do NOT use it for data — data goes in SWR's cache or the server row cache.

## Avoid waterfalls

Parallelize independent requests. For a page that needs filter options AND
main data:

```tsx
// WRONG — sequential waterfall
const filters = await fetch("/api/filters");
const data = await fetch(`/api/data?hub=${filters.hubs[0]}`);

// RIGHT — launch filter fetch on mount, kick off data as soon as hubs arrive
useEffect(() => { fetch("/api/filters")... }, []);
useEffect(() => { if (hubs.length) fetch("/api/data?...") }, [hubs, date]);
```

If the data request can run with a default before filters arrive, start it in
parallel from mount.

## Do not

- Do not fetch the same endpoint from two sibling components — lift the
  fetch to a shared hook or use SWR.
- Do not forget `Cache-Control` on API routes.
- Do not put large parsed data in `sessionStorage` (5MB limit, and JSON
  serialization on every write is slow). Derive it from the server cache.
- Do not invalidate caches "just in case" — only invalidate when you know
  the upstream changed.
