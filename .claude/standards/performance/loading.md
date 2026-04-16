# Initial load

First paint has to feel instant even on a cold visit from a phone on LTE.

## Bundle budget

- First-load JS (main route bundle): **< 200KB gzipped**.
- Individual client component chunk: **< 60KB gzipped** after split.
- Check with `next build` output (it prints each route's first-load JS) or
  `@next/bundle-analyzer` (add locally when investigating).

If a route exceeds budget, the fix is almost always a client-only library
getting pulled in at the top of a Server Component tree — move its import
behind `dynamic(() => import(...), { ssr: false })`.

## Dynamic imports for heavy widgets

Already in use — keep the pattern. Anything that pulls in Recharts, a chart
library, a date picker, or a tableau-scale dataset goes through `dynamic`:

```ts
const PjmLoadForecast = dynamic(() => import("@/components/pjm/PjmLoadForecast"), {
  loading: () => <p className="text-sm text-gray-500">Loading PJM load forecast...</p>,
  ssr: false,
});
```

`ssr: false` is correct here because these components use browser APIs
(`sessionStorage`, Recharts measure). Don't use `ssr: false` on everything —
it delays first paint on data-only components.

## Fonts

Use `next/font` — it self-hosts, inlines font-face CSS, and sets
`font-display: swap`. Never `<link>` to Google Fonts; that's a render-blocking
network hop.

## CSS

- Tailwind is tree-shaken by default — don't import global CSS in individual
  components, it bloats every route.
- Never ship a CSS-in-JS library (styled-components, emotion) — runtime cost
  on every render and inflates bundle.

## Third-party scripts

Every one is a freeze risk. Rules:
- Load through `next/script` with `strategy="lazyOnload"` or `"afterInteractive"`.
- Nothing in `<head>` that blocks render (Vercel Analytics and Speed Insights
  are fine — they're async).
- Before adding any new third-party SDK, check its size and whether you can
  use a thinner API instead.

## Images

Always `next/image`. Never `<img>`. The component handles responsive sizing,
lazy loading, and modern formats automatically.

## Turbopack

Dev uses Turbopack by default (Next 15+). No action required — just don't
add webpack plugins to `next.config.ts` that aren't Turbopack-compatible.

## Do not

- Do not import Recharts / tanstack-table / any date-picker directly into a
  page file. Always behind `dynamic`.
- Do not ship a library purely to avoid a 30-line utility function.
- Do not add `"use client"` to a component that doesn't need interactivity —
  that forces everything downstream to be a Client Component and bloats JS.
