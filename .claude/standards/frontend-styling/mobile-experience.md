# Mobile experience: standard

This app must be usable on a phone. Target use case: monitoring dashboards
(PJM, Genscape, ICE Cash) while away from a desk.

## Guiding principle

**Full fidelity, not a summary.** Tables keep every column (HE1..HE24,
components, markets, etc.) on mobile. Rely on horizontal scroll with a sticky
first column — do NOT hide columns behind "expand" toggles or collapse data
into on-peak/off-peak/flat summaries. Users explicitly want every detail on
their phone.

What to optimize instead: layout chrome, controls, and tap targets. Get the
toolbar, header, and navigation out of the way so the data has maximum screen
real estate.

## Breakpoints

- **`<md` (phone / narrow tablet, <768px)**: mobile mode. Sidebar hidden behind
  a drawer. Page header stacks vertically. Controls stack vertically or snap
  to a 2-col grid. Tap targets ≥40px.
- **`>=md` (desktop / landscape tablet)**: docked sidebar, horizontal header,
  horizontal toolbars.

Use the `md:` Tailwind prefix for navigation-level responsive behavior. Use
`sm:` for finer-grained typography and padding tweaks.

## Sidebar

Rendered by `components/Sidebar.tsx`. Pattern:

- Fixed overlay on `<md` with a backdrop: `fixed inset-y-0 left-0 z-40 ... md:static`
- Slides in via `translate-x`: `-translate-x-full md:translate-x-0` when closed,
  `translate-x-0` when open
- Backdrop: `fixed inset-0 z-30 bg-black/60 md:hidden`
- Close (X) button inside the drawer on `<md`
- Nav item clicks auto-close the drawer (`handleSectionChange` wraps
  `onSectionChange` and calls `onMobileClose`)

`HomePageClient` owns `mobileNavOpen` state and renders a hamburger button
visible only on `<md` that sets it to `true`.

## Page header

`HomePageClient` header row uses `flex flex-col gap-4 md:flex-row md:items-start md:justify-between`.

- Title + subtitle on top (always).
- `ParquetMetaStrip` below title on mobile, on the right on desktop.
- "Helios CTA | Gas Markets" subtitle is `hidden md:block` in the main header
  (shown in the mobile top bar instead).
- Main padding: `px-3 py-4 sm:px-8 sm:py-8`.

## Feature card wrappers

The wrappers around each feature (`<GenscapeNomsTable />`, `<PjmLoadForecast />`, etc.)
use `p-3 sm:p-6` — less padding on mobile so tables keep more width.

## Toolbars and controls

Two acceptable layouts at `<md`:

1. **Vertical stack** (`flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4`) — default.
2. **2-col grid** (`grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-4`) — for toolbars with several compact inputs. Use `col-span-2` on controls that need the full width (e.g., View mode pills).

Rules for inputs inside a toolbar:

- `w-full sm:w-auto` on date/text/select inputs.
- Vertical padding: `py-2 sm:py-1.5` (≥40px tap target on mobile; denser on desktop).
- Button groups that act as segmented controls: each button gets
  `flex-1 sm:flex-none` so the group fills the row on mobile.

Dropdowns / multi-selects:
- Use `w-full sm:max-w-xl` (or similar) — never a hardcoded `max-w-*` without a
  `sm:` or `md:` prefix.

## Tables (the non-negotiable)

Wrap in `overflow-x-auto` and give the first column `sticky left-0 z-10` with
the same background as the row so it stays visible while swiping. Don't hide
columns on mobile. Don't replace tables with summary cards on mobile.

## Charts

Recharts `ResponsiveContainer` width scales automatically — no mobile-specific
sizing needed. Keep chart heights in the 280–360px range; users can tap the
Focus button to expand into the full-screen overlay.

## Viewport meta

Declared once in `app/layout.tsx`:

```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f1117",
};
```

Do not add `user-scalable=no` — pinch-to-zoom must work as an accessibility
escape hatch when a wide table is being scrubbed.

## Do not

- Do not hide data columns on mobile.
- Do not introduce a separate mobile-only component or route — every page uses
  the same component tree and adapts via Tailwind breakpoints.
- Do not use fixed pixel widths without a responsive prefix.
- Do not shrink tap targets below 40px on `<md`.
- Do not use `hidden sm:block` to hide labels or controls the user still needs
  on mobile — only hide decorative chrome.
