# Performance Standards

Target: **every view feels instant**. For a cached view the user should never
see a loading state longer than 200ms; for a cold view, under 1s to first
meaningful paint.

## Core Web Vitals targets

| Metric | Target |
| ------ | ------ |
| LCP    | < 1.5s |
| INP    | < 200ms |
| CLS    | < 0.1 |
| TTFB   | < 500ms |

Measure on Vercel Analytics + Speed Insights (production). Don't ship a
perf-affecting change without a before/after measurement.

## Guiding principles

1. **Cache at every layer** — Azure blob, server in-process row cache,
   Vercel edge cache, browser `Cache-Control`, client `sessionStorage`.
   A cache miss at one layer should hit the next.
2. **Show stale data instantly, revalidate in the background** — never block
   the UI on a network request when something "close enough" is already known.
3. **Ship less JS** — prefer Server Components, dynamic-import heavy widgets,
   and keep the main bundle lean.
4. **Measure, don't guess** — Lighthouse, bundle analyzer, Speed Insights.

## Contents

- [`loading.md`](./loading.md) — initial page load, bundle budget, code
  splitting, fonts, third-party scripts.
- [`data.md`](./data.md) — API response caching, stale-while-revalidate,
  client-side data fetching, avoiding waterfalls.
- [`rendering.md`](./rendering.md) — Server vs Client Components,
  memoization, chart + table performance, avoiding re-renders.
- [`measurement.md`](./measurement.md) — how to test, tools, what to check
  before every PR.
