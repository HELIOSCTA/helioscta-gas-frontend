"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  PARQUET_REFRESH_EVENT,
  type ParquetRefreshDetail,
} from "@/components/ParquetMetaStrip";

/* ------------------------------------------------------------------ */
/*  sessionStorage helpers                                             */
/* ------------------------------------------------------------------ */

const CACHE_PREFIX = "pjm-load-forecast:";

function cacheGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function cacheSet(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    // silently skip
  }
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ForecastRow {
  forecast_execution_datetime_utc: string;
  timezone: string;
  forecast_execution_datetime_local: string;
  forecast_rank: number;
  forecast_execution_date: string;
  forecast_datetime: string;
  forecast_date: string;
  hour_ending: number;
  region: string;
  forecast_load_mw: number;
}

interface FiltersResponse {
  regions: string[];
  ranks: number[];
  dateRange: { min: string; max: string };
}

type ViewMode = "overview" | "revisions";

/* ------------------------------------------------------------------ */
/*  Vintage definitions                                                */
/* ------------------------------------------------------------------ */

interface Vintage {
  key: string;
  label: string;
  color: string;
  strokeWidth: number;
  dash?: string;
}

const VINTAGES: Vintage[] = [
  { key: "latest",  label: "Latest",  color: "#60a5fa", strokeWidth: 2.2 },
  { key: "da-12h",  label: "DA -12h", color: "#a78bfa", strokeWidth: 1.5, dash: "5 3" },
  { key: "da-24h",  label: "DA -24h", color: "#34d399", strokeWidth: 1.5, dash: "5 3" },
  { key: "da-48h",  label: "DA -48h", color: "#fbbf24", strokeWidth: 1.5, dash: "5 3" },
];

/** A resolved vintage: maps a vintage definition to a specific exec datetime */
interface ResolvedVintage {
  vintage: Vintage;
  execLocal: string; // the actual forecast_execution_datetime_local
  heMap: Map<number, number>;
}

/** Given all rows for a single forecast_date+region, resolve vintages.
 *  Latest = most recent execution datetime.
 *  DA -Xh = latest revision issued >= X hours before the latest. */
function resolveVintages(rows: ForecastRow[]): ResolvedVintage[] {
  if (rows.length === 0) return [];

  // Group by exec local datetime → HE map
  const byExec = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const exec = r.forecast_execution_datetime_local;
    let heMap = byExec.get(exec);
    if (!heMap) { heMap = new Map(); byExec.set(exec, heMap); }
    heMap.set(r.hour_ending, r.forecast_load_mw);
  }

  const sortedExecs = [...byExec.keys()].sort();
  if (sortedExecs.length === 0) return [];

  const latestExec = sortedExecs[sortedExecs.length - 1];
  const latestMs = new Date(latestExec).getTime();

  const result: ResolvedVintage[] = [];

  for (const v of VINTAGES) {
    if (v.key === "latest") {
      result.push({ vintage: v, execLocal: latestExec, heMap: byExec.get(latestExec)! });
      continue;
    }
    const hoursBack = v.key === "da-12h" ? 12 : v.key === "da-24h" ? 24 : 48;
    const cutoffMs = latestMs - hoursBack * 3600_000;
    for (let i = sortedExecs.length - 1; i >= 0; i--) {
      if (new Date(sortedExecs[i]).getTime() <= cutoffMs) {
        result.push({ vintage: v, execLocal: sortedExecs[i], heMap: byExec.get(sortedExecs[i])! });
        break;
      }
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const HE_COLS = Array.from({ length: 24 }, (_, i) => i + 1);
const ON_PEAK_HES = new Set([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
const OFF_PEAK_HES = new Set([1, 2, 3, 4, 5, 6, 7, 24]);

const REGION_ORDER = ["RTO", "SOUTH", "MIDATL", "MID_ATL", "MID ATL", "WEST"];
function sortRegions(regions: string[]): string[] {
  const idx = (r: string) => {
    const i = REGION_ORDER.indexOf(r);
    return i === -1 ? REGION_ORDER.length : i;
  };
  return [...regions].sort((a, b) => {
    const di = idx(a) - idx(b);
    return di !== 0 ? di : a.localeCompare(b);
  });
}

const REVISION_COLORS = [
  "#60a5fa", "#f87171", "#a78bfa", "#34d399", "#fbbf24",
  "#ec4899", "#84cc16", "#06b6d4", "#f59e0b", "#4cc9f0",
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function forwardDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtMw(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "\u2014";
  return Math.round(val).toLocaleString("en-US");
}

function fmtRamp(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "\u2014";
  const r = Math.round(val);
  if (r > 0) return `+${r.toLocaleString("en-US")}`;
  if (r < 0) return r.toLocaleString("en-US");
  return "0";
}

function rampClass(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "text-gray-500";
  const r = Math.round(val);
  if (r > 0) return "text-emerald-400";
  if (r < 0) return "text-red-400";
  return "text-gray-400";
}

function fmtDateLabel(dateStr: string, idx: number): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${day} (Day +${idx})`;
}

/** Format as "Wed Apr-16 11:47 AM" (EPT — data is already local) */
function fmtExecLocal(isoStr: string): string {
  const d = new Date(isoStr);
  const weekday = d.toLocaleString("en-US", { timeZone: "UTC", weekday: "short" });
  const month = d.toLocaleString("en-US", { timeZone: "UTC", month: "short" });
  const day = d.toLocaleString("en-US", { timeZone: "UTC", day: "2-digit" });
  const time = d.toLocaleString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit", hour12: true });
  return `${weekday} ${month}-${day} ${time}`;
}

function computeAverages(heMap: Map<number, number>) {
  let onSum = 0, onCount = 0, offSum = 0, offCount = 0;
  for (const [he, mw] of heMap) {
    if (ON_PEAK_HES.has(he)) { onSum += mw; onCount++; }
    if (OFF_PEAK_HES.has(he)) { offSum += mw; offCount++; }
  }
  const total = onSum + offSum;
  const totalCount = onCount + offCount;
  return {
    onPeak: onCount > 0 ? Math.round(onSum / onCount) : null,
    offPeak: offCount > 0 ? Math.round(offSum / offCount) : null,
    flat: totalCount > 0 ? Math.round(total / totalCount) : null,
  };
}

function computeRamps(heMap: Map<number, number>) {
  const r = new Map<number, number | null>();
  for (const he of HE_COLS) {
    if (he === 1) { r.set(he, null); continue; }
    const cur = heMap.get(he);
    const prev = heMap.get(he - 1);
    if (cur != null && prev != null) r.set(he, cur - prev);
    else r.set(he, null);
  }
  return r;
}

/* ------------------------------------------------------------------ */
/*  ChartCard: Focus mode wrapper                                      */
/* ------------------------------------------------------------------ */

function ChartCard({
  title,
  children,
  height,
}: {
  title: string;
  children: (opts: {
    chartHeight: number;
    hiddenSeries: Set<string>;
    toggleSeries: (key: string) => void;
  }) => React.ReactNode;
  height: number;
}) {
  const [focused, setFocused] = useState(false);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const toggleSeries = useCallback((key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const card = (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/80 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium text-slate-400">{title}</h4>
        <button
          onClick={() => setFocused((v) => !v)}
          className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
            focused
              ? "border-cyan-500/50 text-cyan-400 bg-cyan-500/10"
              : "border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600"
          }`}
        >
          {focused ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          )}
          {focused ? "Collapse" : "Focus"}
        </button>
      </div>
      {children({ chartHeight: focused ? 600 : height, hiddenSeries, toggleSeries })}
    </div>
  );

  if (!focused) return card;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8"
      onClick={(e) => { if (e.target === e.currentTarget) setFocused(false); }}
    >
      <div className="w-full max-w-[1400px]">{card}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Legend with click-to-toggle                                         */
/* ------------------------------------------------------------------ */

function LegendItem({
  seriesKey,
  label,
  color,
  dash,
  hiddenSeries,
  toggleSeries,
}: {
  seriesKey: string;
  label: string;
  color: string;
  dash?: string;
  hiddenSeries: Set<string>;
  toggleSeries: (key: string) => void;
}) {
  const hidden = hiddenSeries.has(seriesKey);
  return (
    <button
      onClick={() => toggleSeries(seriesKey)}
      className={`flex cursor-pointer items-center gap-1.5 transition-opacity ${
        hidden ? "opacity-35 line-through" : ""
      } text-slate-400 hover:text-slate-200`}
    >
      <span
        className="inline-block h-0.5 w-4 rounded"
        style={{
          background: color,
          borderTop: dash ? `2px dashed ${color}` : undefined,
          height: dash ? 0 : undefined,
        }}
      />
      {label}
    </button>
  );
}

function VintageLegend({
  vintages,
  hiddenSeries,
  toggleSeries,
}: {
  vintages: ResolvedVintage[];
  hiddenSeries: Set<string>;
  toggleSeries: (key: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]">
      {vintages.map((rv) => (
        <LegendItem
          key={rv.execLocal}
          seriesKey={rv.execLocal}
          label={fmtExecLocal(rv.execLocal)}
          color={rv.vintage.color}
          dash={rv.vintage.dash}
          hiddenSeries={hiddenSeries}
          toggleSeries={toggleSeries}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared HE table header                                             */
/* ------------------------------------------------------------------ */

function HeTableHeader({ firstColLabel = "Metric" }: { firstColLabel?: string } = {}) {
  return (
    <tr className="bg-[#16263d]">
      <th className="sticky left-0 z-10 bg-[#16263d] px-2 py-1.5 text-left text-[#e6efff] font-semibold whitespace-nowrap">{firstColLabel}</th>
      <th className="px-2 py-1.5 text-left text-[#e6efff] font-semibold whitespace-nowrap">Unit</th>
      {HE_COLS.map((he) => (
        <th key={he} className="px-2 py-1.5 text-right text-[#e6efff] font-semibold whitespace-nowrap">HE{he}</th>
      ))}
      <th className="px-2 py-1.5 text-right text-amber-400 font-semibold whitespace-nowrap">OnPeak</th>
      <th className="px-2 py-1.5 text-right text-amber-400 font-semibold whitespace-nowrap">OffPeak</th>
      <th className="px-2 py-1.5 text-right text-amber-400 font-semibold whitespace-nowrap">Flat</th>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Per-day vintage chart sub-component                                */
/* ------------------------------------------------------------------ */

function VintageChartInner({
  vintages, height, hiddenSeries, toggleSeries,
}: {
  vintages: ResolvedVintage[];
  height: number;
  hiddenSeries: Set<string>;
  toggleSeries: (key: string) => void;
}) {
  const chartData = useMemo(() => {
    return HE_COLS.map((he) => {
      const point: Record<string, string | number> = { he: `HE${he}` };
      for (const rv of vintages) {
        if (!hiddenSeries.has(rv.execLocal)) {
          const mw = rv.heMap.get(he);
          if (mw != null) point[rv.execLocal] = mw;
        }
      }
      return point;
    });
  }, [vintages, hiddenSeries]);

  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#283442" />
          <XAxis dataKey="he" tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} />
          <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
            domain={["dataMin - 3000", "dataMax + 3000"]} />
          <Tooltip
            contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#9ca3af" }}
            formatter={(value: number, name: string) => [`${value.toLocaleString()} MW`, fmtExecLocal(name)]}
          />
          {vintages.map((rv) => (
            !hiddenSeries.has(rv.execLocal) ? (
              <Line key={rv.execLocal} type="monotone" dataKey={rv.execLocal} name={rv.execLocal}
                stroke={rv.vintage.color} strokeWidth={rv.vintage.strokeWidth}
                strokeDasharray={rv.vintage.dash} dot={false} activeDot={{ r: 4 }}
                isAnimationActive={false} />
            ) : null
          ))}
        </LineChart>
      </ResponsiveContainer>
      <VintageLegend vintages={vintages} hiddenSeries={hiddenSeries} toggleSeries={toggleSeries} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Per-day section sub-component                                      */
/* ------------------------------------------------------------------ */

interface DaySectionProps {
  dateStr: string;
  dayIdx: number;
  vintages: ResolvedVintage[];
}

function DaySection({ dateStr, dayIdx, vintages }: DaySectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showRamp, setShowRamp] = useState(false);

  const latestRv = vintages.find((rv) => rv.vintage.key === "latest");
  const latestHeMap = latestRv?.heMap;
  const avgs = useMemo(() => latestHeMap ? computeAverages(latestHeMap) : { onPeak: null, offPeak: null, flat: null }, [latestHeMap]);
  const ramps = useMemo(() => latestHeMap ? computeRamps(latestHeMap) : new Map(), [latestHeMap]);

  if (!latestHeMap) return null;

  return (
    <div className="rounded-lg border border-[#20324c] bg-[rgba(11,18,32,0.55)] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-4 py-2.5 bg-[#111d31] hover:brightness-110 transition-all"
      >
        <span className="text-sm font-bold text-[#dbe7ff]">
          {fmtDateLabel(dateStr, dayIdx)}
        </span>
        <svg xmlns="http://www.w3.org/2000/svg"
          className={`h-3.5 w-3.5 text-gray-500 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="p-3 space-y-4">
          {/* Per-day vintage chart */}
          <ChartCard title={`Load Forecast — ${fmtDateLabel(dateStr, dayIdx)}`} height={280}>
            {({ chartHeight, hiddenSeries, toggleSeries }) => (
              <VintageChartInner vintages={vintages} height={chartHeight}
                hiddenSeries={hiddenSeries} toggleSeries={toggleSeries} />
            )}
          </ChartCard>

          {/* Exec metadata + toggle */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-[#9eb4d3]">
              Latest exec: {latestRv ? fmtExecLocal(latestRv.execLocal) : "N/A"}
            </span>
            <button
              onClick={() => setShowRamp(!showRamp)}
              className={`px-3 py-1 text-[11px] font-semibold uppercase tracking-wide rounded border transition-colors ${
                showRamp
                  ? "border-[#4cc9f0] text-[#dbe7ff] bg-[#1a2a42]"
                  : "border-[#2a3f60] text-[#9eb4d3] hover:bg-[#1a2b44] hover:text-[#dbe7ff]"
              }`}
            >
              {showRamp ? "Show Outright" : "Show Ramp"}
            </button>
          </div>

          {/* HE table */}
          <div className="overflow-x-auto rounded-lg border border-[#2a3f60]">
            <table className="w-full border-collapse text-[11px] font-mono">
              <thead><HeTableHeader /></thead>
              <tbody>
                {!showRamp ? (
                  /* Outright */
                  <tr className="border-t border-[#1f334f] hover:bg-[#1c2f4a]">
                    <td className="sticky left-0 z-10 bg-[#0f1a2b] px-2 py-1 text-[#cfe0ff] font-bold whitespace-nowrap">Load</td>
                    <td className="px-2 py-1 text-[#8aa5ca] whitespace-nowrap">MW</td>
                    {HE_COLS.map((he) => (
                      <td key={he} className="px-2 py-1 text-right text-[#dbe7ff] whitespace-nowrap">{fmtMw(latestHeMap.get(he))}</td>
                    ))}
                    <td className="px-2 py-1 text-right text-[#dbe7ff] font-semibold whitespace-nowrap">{fmtMw(avgs.onPeak)}</td>
                    <td className="px-2 py-1 text-right text-[#dbe7ff] font-semibold whitespace-nowrap">{fmtMw(avgs.offPeak)}</td>
                    <td className="px-2 py-1 text-right text-[#dbe7ff] font-semibold whitespace-nowrap">{fmtMw(avgs.flat)}</td>
                  </tr>
                ) : (
                  /* Ramp */
                  <tr className="border-t border-[#1f334f] hover:bg-[#1c2f4a]">
                    <td className="sticky left-0 z-10 bg-[#0f1a2b] px-2 py-1 text-[#cfe0ff] font-bold whitespace-nowrap">Load Ramp</td>
                    <td className="px-2 py-1 text-[#8aa5ca] whitespace-nowrap">MW/hr</td>
                    {HE_COLS.map((he) => {
                      const val = ramps.get(he) ?? null;
                      return <td key={he} className={`px-2 py-1 text-right whitespace-nowrap ${rampClass(val)}`}>{fmtRamp(val)}</td>;
                    })}
                    <td className="px-2 py-1 text-right text-gray-500 whitespace-nowrap">{"\u2014"}</td>
                    <td className="px-2 py-1 text-right text-gray-500 whitespace-nowrap">{"\u2014"}</td>
                    <td className="px-2 py-1 text-right text-gray-500 whitespace-nowrap">{"\u2014"}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Revision multi-select dropdown                                     */
/* ------------------------------------------------------------------ */

interface RevisionMultiSelectProps {
  availableExecs: string[];
  selectedExecs: Set<string>;
  onToggle: (exec: string) => void;
  onSetLatestN: (n: number) => void;
  onClear: () => void;
  execRankMap: Map<string, number>;
  vintageByExec: Map<string, Vintage>;
  colorForExec: Map<string, string>;
}

function RevisionMultiSelect({
  availableExecs,
  selectedExecs,
  onToggle,
  onSetLatestN,
  onClear,
  execRankMap,
  vintageByExec,
  colorForExec,
}: RevisionMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const triggerLabel =
    selectedExecs.size === 0
      ? "Select revisions…"
      : `${selectedExecs.size} of ${availableExecs.length} revision${availableExecs.length === 1 ? "" : "s"} selected`;

  return (
    <div ref={ref} className="relative w-full sm:max-w-xl">
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
        Forecast Execution Datetime
      </label>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:border-gray-500 focus:outline-none"
      >
        <span>{triggerLabel}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-4 w-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-gray-700 bg-gray-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {availableExecs.length} available
            </span>
            <div className="flex gap-3 text-[10px] font-semibold uppercase tracking-wide">
              <button onClick={() => onSetLatestN(5)} className="text-gray-400 transition-colors hover:text-gray-200">Latest 5</button>
              <button onClick={() => onSetLatestN(availableExecs.length)} className="text-gray-400 transition-colors hover:text-gray-200">All</button>
              <button onClick={onClear} className="text-gray-400 transition-colors hover:text-gray-200">Clear</button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {availableExecs.map((exec) => {
              const isSelected = selectedExecs.has(exec);
              const rank = execRankMap.get(exec);
              const vDef = vintageByExec.get(exec);
              const dotColor = isSelected ? (colorForExec.get(exec) ?? vDef?.color ?? "#60a5fa") : "#374151";
              return (
                <button
                  key={exec}
                  onClick={() => onToggle(exec)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] font-mono transition-colors ${
                    isSelected ? "bg-gray-800/80 text-gray-100" : "text-gray-400 hover:bg-gray-800/40 hover:text-gray-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    className="h-3.5 w-3.5 cursor-pointer accent-amber-500"
                  />
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: dotColor }}
                  />
                  <span className="flex-1">{fmtExecLocal(exec)}</span>
                  {rank != null && (
                    <span className="rounded border border-amber-500/30 bg-amber-600/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                      Rank {rank}
                    </span>
                  )}
                  {vDef && (
                    <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: vDef.color }}>
                      {vDef.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function PjmLoadForecast() {
  const [filterOpts, setFilterOpts] = useState<FiltersResponse | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => cacheGet<ViewMode>("viewMode") ?? "overview"
  );

  // ── Region state (shared across views) ──
  const [region, setRegion] = useState(() => cacheGet<string>("region") ?? "RTO");

  // ── Overview state ──
  const [startDate, setStartDate] = useState(() => cacheGet<string>("start") ?? todayStr());
  const [endDate, setEndDate] = useState(() => cacheGet<string>("end") ?? forwardDate(7));
  const [overviewRows, setOverviewRows] = useState<ForecastRow[]>([]);

  // ── Revisions state ──
  const [revDate, setRevDate] = useState(() => cacheGet<string>("revDate") ?? todayStr());
  const [revRows, setRevRows] = useState<ForecastRow[]>([]);
  const [selectedExecs, setSelectedExecs] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheBust, setCacheBust] = useState(0);

  // Persist
  useEffect(() => { cacheSet("viewMode", viewMode); }, [viewMode]);
  useEffect(() => { cacheSet("region", region); }, [region]);
  useEffect(() => { cacheSet("start", startDate); }, [startDate]);
  useEffect(() => { cacheSet("end", endDate); }, [endDate]);
  useEffect(() => { cacheSet("revDate", revDate); }, [revDate]);

  // Listen for global parquet refresh events from ParquetMetaStrip
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ParquetRefreshDetail>).detail;
      if (detail?.dataset === "pjm-load-forecast") {
        setCacheBust((n) => n + 1);
      }
    };
    window.addEventListener(PARQUET_REFRESH_EVENT, handler);
    return () => window.removeEventListener(PARQUET_REFRESH_EVENT, handler);
  }, []);

  useEffect(() => {
    fetch("/api/pjm/load-forecast/filters")
      .then((r) => r.json())
      .then((data: FiltersResponse) => setFilterOpts(data))
      .catch((err) => console.error("Failed to load filters:", err));
  }, []);

  // ── Fetch: Overview (ALL revisions for vintage computation) ──
  const fetchOverview = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      start: startDate, end: endDate,
      region, vintages: "true",
      limit: "10000", offset: "0",
      _cb: String(cacheBust),
    });
    fetch(`/api/pjm/load-forecast?${params}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => setOverviewRows(data.rows ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [startDate, endDate, region, cacheBust]);

  // ── Fetch: Revisions ──
  const fetchRevisions = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      start: revDate, end: revDate,
      region,
      limit: "10000", offset: "0",
      _cb: String(cacheBust),
    });
    fetch(`/api/pjm/load-forecast?${params}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        const rows: ForecastRow[] = data.rows ?? [];
        setRevRows(rows);
        if (rows.length > 0) {
          const execs = [...new Set(rows.map((r) => r.forecast_execution_datetime_local))].sort();
          setSelectedExecs(new Set([execs[execs.length - 1]]));
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [revDate, region, cacheBust]);

  useEffect(() => {
    if (viewMode === "overview") fetchOverview();
    else fetchRevisions();
  }, [viewMode, fetchOverview, fetchRevisions]);

  // ── Overview: compute vintages per forecast_date ──
  const overviewDayGroups = useMemo(() => {
    const byDate = new Map<string, ForecastRow[]>();
    for (const r of overviewRows) {
      let arr = byDate.get(r.forecast_date);
      if (!arr) { arr = []; byDate.set(r.forecast_date, arr); }
      arr.push(r);
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, rows]) => ({
        date,
        vintages: resolveVintages(rows),
      }));
  }, [overviewRows]);

  // ── Overview: collect unique vintages across all days for chart lines ──
  const overviewVintageKeys = useMemo(() => {
    // Use the first day's vintages as the canonical set (same vintage defs across days)
    if (overviewDayGroups.length === 0) return [] as ResolvedVintage[];
    return overviewDayGroups[0].vintages;
  }, [overviewDayGroups]);

  // ── Overview chart: continuous hourly with exec-datetime-keyed lines ──
  const overviewChartData = useMemo(() => {
    return overviewDayGroups.flatMap(({ date, vintages: dayVintages }) => {
      const d = new Date(date + "T00:00:00");
      const dayLabel = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      return HE_COLS.map((he) => {
        const point: Record<string, string | number> = { label: `${dayLabel} HE${he}` };
        for (const rv of dayVintages) {
          const mw = rv.heMap.get(he);
          if (mw != null) point[rv.vintage.key] = mw;
        }
        return point;
      });
    });
  }, [overviewDayGroups]);

  // ── Revisions: available execs + vintage pills ──
  const availableExecs = useMemo(() => {
    const execs = [...new Set(revRows.map((r) => r.forecast_execution_datetime_local))];
    return execs.sort((a, b) => b.localeCompare(a));
  }, [revRows]);

  const revisionVintages = useMemo(() => resolveVintages(revRows), [revRows]);

  const execRankMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of revRows) {
      if (!m.has(r.forecast_execution_datetime_local)) {
        m.set(r.forecast_execution_datetime_local, r.forecast_rank);
      }
    }
    return m;
  }, [revRows]);

  const vintageByExec = useMemo(() => {
    const m = new Map<string, Vintage>();
    for (const rv of revisionVintages) m.set(rv.execLocal, rv.vintage);
    return m;
  }, [revisionVintages]);

  const colorForExec = useMemo(() => {
    const m = new Map<string, string>();
    const sorted = [...selectedExecs].sort();
    sorted.forEach((exec, i) => {
      const vDef = vintageByExec.get(exec);
      m.set(exec, vDef?.color ?? REVISION_COLORS[i % REVISION_COLORS.length]);
    });
    return m;
  }, [selectedExecs, vintageByExec]);

  const revisionHeMaps = useMemo(() => {
    const maps = new Map<string, Map<number, number>>();
    for (const exec of selectedExecs) {
      const heMap = new Map<number, number>();
      for (const r of revRows) {
        if (r.forecast_execution_datetime_local === exec) {
          heMap.set(r.hour_ending, r.forecast_load_mw);
        }
      }
      if (heMap.size > 0) maps.set(exec, heMap);
    }
    return maps;
  }, [revRows, selectedExecs]);

  const revisionChartData = useMemo(() => {
    const execs = [...revisionHeMaps.keys()].sort();
    return HE_COLS.map((he) => {
      const point: Record<string, string | number> = { he: `HE${he}` };
      for (const exec of execs) {
        const mw = revisionHeMaps.get(exec)?.get(he);
        if (mw != null) point[exec] = mw;
      }
      return point;
    });
  }, [revisionHeMaps]);

  const toggleExec = (exec: string) => {
    setSelectedExecs((prev) => {
      const next = new Set(prev);
      if (next.has(exec)) next.delete(exec);
      else next.add(exec);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* ── Toolbar ── */}
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-4">
        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">View</label>
          <div className="flex gap-1">
            {(["overview", "revisions"] as const).map((mode) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium capitalize transition-colors sm:flex-none sm:py-1.5 ${
                  viewMode === mode
                    ? "bg-amber-600 text-white"
                    : "border border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                }`}>
                {mode}
              </button>
            ))}
          </div>
        </div>

        {viewMode === "overview" && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                min={filterOpts?.dateRange.min} max={filterOpts?.dateRange.max}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none sm:w-auto sm:py-1.5" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                min={filterOpts?.dateRange.min} max={filterOpts?.dateRange.max}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none sm:w-auto sm:py-1.5" />
            </div>
          </>
        )}
        {viewMode === "revisions" && (
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Forecast Date</label>
            <input type="date" value={revDate} onChange={(e) => setRevDate(e.target.value)}
              min={filterOpts?.dateRange.min} max={filterOpts?.dateRange.max}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none sm:w-auto sm:py-1.5" />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Region</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none sm:w-auto sm:py-1.5"
          >
            {sortRegions(filterOpts?.regions ?? [region]).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

      </div>

      {/* ── Status ── */}
      {loading && <p className="text-sm text-gray-500">Loading {region} load forecast data...</p>}
      {error && <p className="text-sm text-red-400">Error: {error}</p>}
      {!loading && !error && (viewMode === "overview" ? overviewRows : revRows).length === 0 && (
        <p className="text-sm text-gray-500">No forecast data found for the selected date range.</p>
      )}

      {/* ============================================================== */}
      {/*  OVERVIEW MODE                                                  */}
      {/* ============================================================== */}
      {viewMode === "overview" && !loading && (
        <>
          {/* Overview chart with vintage lines */}
          {overviewChartData.length > 0 && (
            <ChartCard title={`Load Forecast — ${region}`} height={360}>
              {({ chartHeight, hiddenSeries, toggleSeries }) => (
                <>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <LineChart data={overviewChartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#283442" />
                      <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false}
                        interval="preserveStartEnd" minTickGap={80} />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false}
                        tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                        domain={["dataMin - 5000", "dataMax + 5000"]} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: "#9ca3af" }}
                        formatter={(value: number, name: string) => {
                          const rv = overviewVintageKeys.find((r) => r.vintage.key === name);
                          return [`${value.toLocaleString()} MW`, rv ? fmtExecLocal(rv.execLocal) : name];
                        }}
                      />
                      {overviewVintageKeys.map((rv) => (
                        !hiddenSeries.has(rv.vintage.key) ? (
                          <Line key={rv.vintage.key} type="monotone" dataKey={rv.vintage.key} name={rv.vintage.key}
                            stroke={rv.vintage.color} strokeWidth={rv.vintage.strokeWidth}
                            strokeDasharray={rv.vintage.dash} dot={false} activeDot={{ r: 4 }}
                            connectNulls={false} isAnimationActive={false} />
                        ) : null
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]">
                    {overviewVintageKeys.map((rv) => (
                      <LegendItem key={rv.vintage.key} seriesKey={rv.vintage.key}
                        label={fmtExecLocal(rv.execLocal)}
                        color={rv.vintage.color} dash={rv.vintage.dash}
                        hiddenSeries={hiddenSeries} toggleSeries={toggleSeries} />
                    ))}
                  </div>
                </>
              )}
            </ChartCard>
          )}

          {/* Per-day sections with vintage charts + tables */}
          {overviewDayGroups.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Hourly Breakdown by Forecast Date
              </h3>
              {overviewDayGroups.map(({ date, vintages }, i) => (
                <DaySection key={date} dateStr={date} dayIdx={i} vintages={vintages} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ============================================================== */}
      {/*  REVISIONS MODE                                                 */}
      {/* ============================================================== */}
      {viewMode === "revisions" && !loading && (
        <>
          {/* Multi-select revision picker */}
          {availableExecs.length > 0 && (
            <RevisionMultiSelect
              availableExecs={availableExecs}
              selectedExecs={selectedExecs}
              onToggle={toggleExec}
              onSetLatestN={(n) => setSelectedExecs(new Set(availableExecs.slice(0, n)))}
              onClear={() => setSelectedExecs(new Set())}
              execRankMap={execRankMap}
              vintageByExec={vintageByExec}
              colorForExec={colorForExec}
            />
          )}

          {/* Revisions chart */}
          {revisionChartData.length > 0 && selectedExecs.size > 0 && (
            <ChartCard title={`Hourly Load by Revision — ${revDate}`} height={360}>
              {({ chartHeight, hiddenSeries, toggleSeries: toggleChartSeries }) => {
                const sortedExecs = [...selectedExecs].sort();
                return (
                  <>
                    <ResponsiveContainer width="100%" height={chartHeight}>
                      <LineChart data={revisionChartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#283442" />
                        <XAxis dataKey="he" tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} />
                        <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false}
                          tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                          domain={["dataMin - 3000", "dataMax + 3000"]} />
                        <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
                          labelStyle={{ color: "#9ca3af" }}
                          formatter={(value: number, name: string) => [`${value.toLocaleString()} MW`, fmtExecLocal(name)]} />
                        {sortedExecs.map((exec) => (
                          !hiddenSeries.has(exec) ? (
                            <Line key={exec} type="monotone" dataKey={exec} name={exec}
                              stroke={colorForExec.get(exec) ?? "#60a5fa"}
                              strokeWidth={2} dot={false} activeDot={{ r: 4 }}
                              isAnimationActive={false} />
                          ) : null
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]">
                      {sortedExecs.map((exec) => (
                        <LegendItem key={exec} seriesKey={exec}
                          label={fmtExecLocal(exec)}
                          color={colorForExec.get(exec) ?? "#60a5fa"}
                          hiddenSeries={hiddenSeries} toggleSeries={toggleChartSeries} />
                      ))}
                    </div>
                  </>
                );
              }}
            </ChartCard>
          )}

          {/* Aggregated revisions table */}
          {selectedExecs.size > 0 && (
            <div className="rounded-lg border border-[#20324c] bg-[rgba(11,18,32,0.55)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#111d31]">
                <span className="text-sm font-semibold text-[#dbe7ff]">
                  Selected Revisions &mdash; {selectedExecs.size}
                </span>
              </div>
              <div className="p-3 overflow-x-auto">
                <div className="rounded-lg border border-[#2a3f60]">
                  <table className="w-full border-collapse text-[11px] font-mono">
                    <thead><HeTableHeader firstColLabel="Revision" /></thead>
                    <tbody>
                      {[...selectedExecs].sort((a, b) => b.localeCompare(a)).map((exec) => {
                        const heMap = revisionHeMaps.get(exec);
                        if (!heMap) return null;
                        const rank = execRankMap.get(exec);
                        const vDef = vintageByExec.get(exec);
                        const color = colorForExec.get(exec) ?? "#60a5fa";
                        const a = computeAverages(heMap);
                        return (
                          <tr key={exec} className="border-t border-[#1f334f] hover:bg-[#1c2f4a]">
                            <td className="sticky left-0 z-10 bg-[#0f1a2b] px-2 py-1 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: color }} />
                                <span className="text-[#dbe7ff] font-semibold">{fmtExecLocal(exec)}</span>
                                {rank != null && (
                                  <span className="rounded border border-amber-500/30 bg-amber-600/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                                    Rank {rank}
                                  </span>
                                )}
                                {vDef && (
                                  <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: vDef.color }}>
                                    {vDef.label}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1 text-[#8aa5ca] whitespace-nowrap">MW</td>
                            {HE_COLS.map((he) => (
                              <td key={he} className="px-2 py-1 text-right text-[#dbe7ff] whitespace-nowrap">{fmtMw(heMap.get(he))}</td>
                            ))}
                            <td className="px-2 py-1 text-right text-[#dbe7ff] font-semibold whitespace-nowrap">{fmtMw(a.onPeak)}</td>
                            <td className="px-2 py-1 text-right text-[#dbe7ff] font-semibold whitespace-nowrap">{fmtMw(a.offPeak)}</td>
                            <td className="px-2 py-1 text-right text-[#dbe7ff] font-semibold whitespace-nowrap">{fmtMw(a.flat)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
