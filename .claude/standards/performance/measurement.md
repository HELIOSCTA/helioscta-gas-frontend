# Measurement

"Faster" means nothing without numbers. Before shipping a perf-affecting
change, measure before and after.

## Production: Vercel Speed Insights + Analytics

Enable both on the Vercel project (already enabled if the repo is deployed).
They give you field-data Core Web Vitals segmented by route and device.

What to check weekly:
- **LCP p75** per route — must be < 1.5s.
- **INP p75** per route — must be < 200ms. Regressions here usually mean
  a new component added synchronous work to interaction handlers.
- **CLS** — should stay < 0.1. If it jumps, usually a new image or font
  without dimensions set.

## Local: `next build` output

Run `cd frontend && npm run build`. The output prints per-route first-load
JS and server/static distinction. Scan for:

- Route > 200KB first-load JS → investigate which import bloated it.
- Large "shared" chunks — usually a library pulled into a Client Component
  tree that should have been dynamic-imported.

## Local: Lighthouse

Run Lighthouse on a production build (`npm run build && npm run start`),
not on dev (`npm run dev` is unoptimized).

Target scores:
- Performance: 90+ desktop, 80+ mobile
- Best Practices: 95+
- Accessibility: 95+

## Local: React DevTools Profiler

For a specific slow interaction, record a profile:

1. Open React DevTools → Profiler tab.
2. Click record, perform the interaction, stop.
3. Look at the flame graph — any component > 16ms in render is a candidate
   for memoization or extraction.

## Bundle analyzer (when investigating)

Add `@next/bundle-analyzer` locally (don't commit it as a dependency):

```bash
cd frontend
ANALYZE=true npm run build
```

Opens interactive treemaps of each chunk. Useful for answering "why is
route X so big?".

## What to measure before every PR touching perf

1. Before change: record `next build` first-load JS for affected route.
2. Make change.
3. After change: re-record first-load JS.
4. Include the before/after in the PR description.

If the change isn't strictly about perf (e.g., a feature addition), at
minimum confirm that first-load JS didn't regress by >10KB.

## Do not

- Do not benchmark on `npm run dev` — dev mode has React strict-mode double
  renders, no minification, and no prod optimizations. Numbers are
  meaningless.
- Do not optimize without measuring — you'll spend an hour shaving 0.1ms and
  miss the 500ms bottleneck next door.
- Do not ship perf "improvements" that regress Core Web Vitals. Check Speed
  Insights 24–48h after deploy.
