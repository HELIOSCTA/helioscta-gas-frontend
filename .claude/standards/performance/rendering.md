# Rendering performance

Goal: after data arrives, first paint happens in one React render. No
re-render cascades, no animation-driven repaints, no 100ms tooltip jank.

## Server vs Client Components

Default to **Server Components**. Add `"use client"` only when the component
actually needs:

- Browser APIs (`window`, `sessionStorage`, `document`)
- React state or effects (`useState`, `useEffect`, `useRef`)
- Event handlers (`onClick`, `onChange`)
- Third-party libs that require a browser (Recharts, date pickers)

Examples in this repo:
- `HomePageClient.tsx` — must be client (navigation state, sidebar drawer).
- Pure presentational blocks inside the home page (static cards, headers)
  should be Server Components where possible.
- `PjmLoadForecast`, `PjmLmpPrices` — must be client (Recharts + sessionStorage).

The rule: the `"use client"` boundary should be **as deep as possible in the
tree**. Adding it at the top of a page file forces everything downstream to
ship as JS.

## Memoize expensive aggregations

All parquet row reductions must run inside `useMemo`. See the patterns in
`PjmLoadForecast.tsx`:

```tsx
const overviewDayGroups = useMemo(() => {
  const byDate = new Map<string, ForecastRow[]>();
  for (const r of overviewRows) { ... }
  return [...byDate.entries()].sort(...);
}, [overviewRows]);
```

Rules:
- Depend only on the inputs that actually affect the output.
- Never include objects recreated every render (e.g., inline config objects) —
  that defeats memoization.
- Nested maps / lookups: build them once in a `useMemo`, not inside `render`.

## Don't re-derive series → color mappings

If a chart assigns colors by index (`palette[i % palette.length]`),
memoize the mapping so colors stay stable when the user toggles a legend
item. See `colorForExec` in `PjmLoadForecast.tsx` for the pattern.

## Big tables: virtualize above 500 rows

The HE1–HE24 tables in this repo are small (4–7 rows, 29 columns) — rendering
them fully is fine. But if a new page shows a table with many rows (Historical
Noms, LMP hourlies over months), virtualize with `react-window` or
`@tanstack/react-virtual`:

- Full render cost scales O(rows × cols). At 10k rows it blocks the main
  thread for 500ms+.
- Virtualization renders only the visible window (~30 rows) and swaps on scroll.

If you find yourself paginating in the client purely for perf, virtualize
instead — it's a better UX.

## Charts

- Always `isAnimationActive={false}` (see `plotting.md`) — animations force a
  repaint loop that looks laggy on re-render.
- `dot={false}` on line charts with >50 points — SVG dots dominate paint time.
- Tooltip `formatter` runs on every hover — keep it pure and cheap.

## Avoid unnecessary state in parents

State at the top of `HomePageClient` triggers a re-render of everything
below it. Keep state as local as possible:

- Expanded/collapsed per-row state → inside the row component.
- Focus mode of a chart → inside `ChartCard`.
- Hidden legend series → inside the legend component.

If sibling components need to coordinate state, consider co-locating them
or using a shared context rather than hoisting to `HomePageClient`.

## Stable list keys

- Keys must be stable identifiers (`row.id`, `exec_datetime`, `hub_name`),
  **not array index**.
- Unstable keys make React throw away component state on reorder, which
  causes input focus loss, chart remounts, and animation glitches.

## Debounce / throttle where applicable

- Text inputs that trigger a fetch: debounce 300ms.
- Resize observers: throttle to requestAnimationFrame.
- Window scroll listeners: throttle or use Intersection Observer instead.

## Do not

- Do not call `JSON.parse(JSON.stringify(...))` to clone — it's slow and
  usually a sign of a bug in what you should pass immutably.
- Do not create a new function/object in JSX props without memoization when
  it's passed to a memoized child — defeats `React.memo`.
- Do not wrap every component in `React.memo` preemptively. Only memo
  components that (a) re-render often and (b) have heavy render cost.
- Do not animate layout properties (width/height/top/left). Animate `transform`
  and `opacity` only — they're GPU-composited.
