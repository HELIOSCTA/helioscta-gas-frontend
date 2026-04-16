# Plotting: standard

Charts are built with **Recharts** on a dark UI. Every chart must be responsive,
focus-expandable, legend-togglable, and legible on mobile.

## Library

- Use `recharts` — do NOT introduce Chart.js, Highcharts, d3-direct, Plotly,
  Visx, or other libraries.
- Always wrap the chart in `ResponsiveContainer width="100%"` so it adapts to
  container width (required for mobile).

## Canonical imports

```tsx
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from "recharts";
```

## Colors

### Chart chrome (all dark theme)
- Grid lines: `stroke="#283442"` with `strokeDasharray="3 3"`.
- Axis ticks: `fill="#6b7280"` (neutral gray), `fontSize={11}` (use `10` only
  when label density forces it).
- Axis lines / tick lines: hide both — `tickLine={false}`, `axisLine={false}` on YAxis.
- Tooltip content: `backgroundColor: "#111827"`, `border: "1px solid #374151"`,
  `borderRadius: 8`, `fontSize: 12`, `labelStyle: { color: "#9ca3af" }`.

### Series palettes

Pick the palette for the semantic:

```ts
// Generic categorical — hubs, hubs-like groupings (PjmLmpPrices)
const HUB_COLORS = [
  "#60a5fa", "#fb923c", "#4ade80", "#facc15", "#c084fc",
  "#f87171", "#22d3ee", "#f472b6", "#a3e635", "#fbbf24",
];

// Revision / rank ordering — forecast revisions (PjmLoadForecast)
const REVISION_COLORS = [
  "#60a5fa", "#f87171", "#a78bfa", "#34d399", "#fbbf24",
  "#ec4899", "#84cc16", "#06b6d4", "#f59e0b", "#4cc9f0",
];
```

Assign with `palette[i % palette.length]` and hold the assignment stable while
the underlying series list is stable (memoize the exec→color map, don't
re-derive on every render).

### Named vintages

When a series has a semantic meaning (latest, DA -12h/-24h/-48h), use fixed
colors + dashed strokes so it's the same across every chart in the page:

| Vintage | Color     | Stroke width | Dash      |
| ------- | --------- | ------------ | --------- |
| Latest  | `#60a5fa` | 2.2          | solid     |
| DA -12h | `#a78bfa` | 1.5          | `"5 3"`   |
| DA -24h | `#34d399` | 1.5          | `"5 3"`   |
| DA -48h | `#fbbf24` | 1.5          | `"5 3"`   |

### Delta / PnL coloring

- Positive: `text-emerald-400` / `#4ade80`
- Negative: `text-rose-400` / `#f87171`
- Zero / null: `text-gray-400`

## Axes

- **Y axis** uses a k/M abbreviating tick formatter to keep labels short:

  ```tsx
  tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
  ```

- **Y axis domain** pads the data range so the series isn't pinned to the edges:

  ```tsx
  domain={["dataMin - 3000", "dataMax + 3000"]}   // for MW-scale
  domain={["dataMin - 5000", "dataMax + 5000"]}   // for multi-day MW-scale
  ```

  Pick padding proportional to the expected range; never `auto` — it clips.

- **X axis** for continuous/multi-day data uses `interval="preserveStartEnd"` +
  `minTickGap={80}` to avoid label crowding.

## Lines

Every `<Line>` uses these defaults unless you have a documented reason to deviate:

```tsx
<Line
  type="monotone"
  dot={false}
  activeDot={{ r: 4 }}
  isAnimationActive={false}
  strokeWidth={2}
  // stroke={colorForSeries}
  // strokeDasharray={optionalDash}
/>
```

- `dot={false}` — solid dots add visual noise; the `activeDot` on hover is enough.
- `isAnimationActive={false}` — animations get annoying on fast re-renders.
- `connectNulls={false}` — gaps should stay gaps (missing data is signal).

## Tooltip formatting

- Value: `${value.toLocaleString()} MW` (or `$${value.toFixed(2)}` for prices).
- Label: translate the `dataKey` back into a human-readable label (e.g. exec
  datetime) via a formatter rather than showing the raw key.

## Legend: click-to-toggle, not Recharts default

Use the shared `LegendItem` pattern: each legend entry is a `<button>` that
toggles visibility via a `hiddenSeries: Set<string>` + `toggleSeries(key)`
callback. Hidden series get `opacity-35 line-through`. Skip the default
Recharts `<Legend>` — it's not dark-themed or keyboard-accessible.

## Focus mode: every chart must support it

Wrap charts in a `ChartCard` that accepts a `title` + a `children` render prop
receiving `{ chartHeight, hiddenSeries, toggleSeries }`. The card renders a
"Focus" toggle that expands the chart to a fixed-size full-screen overlay
(`h=600`) with a backdrop; click outside or "Collapse" to close. This is the
sanctioned way to zoom on mobile.

## Sizing

| Context                        | Height |
| ------------------------------ | ------ |
| Compact per-day / per-row chart | 280    |
| Main page chart                 | 360    |
| Focus mode overlay              | 600    |

Keep these constants — don't invent new ones per page. `ResponsiveContainer`
handles width.

## Mobile

Charts automatically work on mobile because of `ResponsiveContainer` +
fixed heights. Do NOT swap in a different chart type at small breakpoints —
the standard is the same chart everywhere.

## Do not

- Do not use Recharts' default tooltip/legend styling — always pass the dark
  `contentStyle` and use the click-to-toggle legend pattern.
- Do not enable animation (`isAnimationActive={true}`) — it lags on re-render
  and masks data updates.
- Do not introduce new chart libraries without discussing first — consistency
  matters more than per-chart optimization.
- Do not put dots on every data point on line charts — use `dot={false}` and
  rely on `activeDot` for hover.
- Do not hardcode widths; always use `ResponsiveContainer width="100%"`.
- Do not re-derive series→color mapping on every render — memoize it so colors
  stay stable as the user toggles legend items.
