"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend, ResponsiveContainer,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

interface HubDef {
  key: string;
  label: string;
  defaultWxRegion: string;
}

const HUBS: HubDef[] = [
  { key: "hh", label: "Henry Hub", defaultWxRegion: "conus" },
  { key: "transco_st85", label: "St 85", defaultWxRegion: "southcentral" },
  { key: "transco_zone_5_south", label: "Transco Zone 5 South", defaultWxRegion: "east" },
  { key: "tetco_m3", label: "Tetco M3", defaultWxRegion: "east" },
  { key: "agt", label: "AGT", defaultWxRegion: "east" },
  { key: "iroquois_z2", label: "Iroquois Z2", defaultWxRegion: "east" },
  { key: "houston_ship_channel", label: "Houston Ship Channel", defaultWxRegion: "southcentral" },
  { key: "waha", label: "Waha", defaultWxRegion: "southcentral" },
  { key: "socal_cg", label: "Socal CG", defaultWxRegion: "pacific" },
  { key: "pge_cg", label: "PGE CG", defaultWxRegion: "pacific" },
  { key: "cig", label: "CIG", defaultWxRegion: "mountain" },
];

const WX_REGIONS = [
  { key: "conus", label: "CONUS" },
  { key: "east", label: "East" },
  { key: "midwest", label: "Midwest" },
  { key: "southcentral", label: "S. Central" },
  { key: "mountain", label: "Mountain" },
  { key: "pacific", label: "Pacific" },
];

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const YEAR_COLORS: Record<number, string> = {
  2026: "#f87171",
  2025: "#d1d5db",
  2024: "#60a5fa",
  2023: "#c084fc",
  2022: "#9ca3af",
  2021: "#fbbf24",
  2020: "#34d399",
};

function getYearColor(year: number): string {
  return YEAR_COLORS[year] ?? "#6b7280";
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getNum(row: Row, col: string): number | null {
  const v = row[col];
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtPrice(v: number | null): string {
  if (v === null) return "—";
  return v.toFixed(3);
}

function fmtSpread(v: number | null): string {
  if (v === null) return "—";
  return v.toFixed(3);
}

function formatGasDay(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** DFN cell background: blue=cold, red=warm, intensity by magnitude */
function dfnBgStyle(v: number | null): React.CSSProperties {
  if (v === null) return {};
  const abs = Math.abs(v);
  const t = Math.min(abs / 12, 1);
  if (v > 0.3) return { backgroundColor: `rgba(59, 130, 246, ${0.12 + t * 0.55})` };
  if (v < -0.3) return { backgroundColor: `rgba(239, 68, 68, ${0.12 + t * 0.55})` };
  return {};
}

/** Cash-balmo cell background */
function spreadBgStyle(v: number | null): React.CSSProperties {
  if (v === null) return {};
  const abs = Math.abs(v);
  const t = Math.min(abs / 0.5, 1);
  if (v > 0) return { backgroundColor: `rgba(34, 197, 94, ${0.15 + t * 0.4})` };
  if (v < 0) return { backgroundColor: `rgba(239, 68, 68, ${0.15 + t * 0.4})` };
  return { backgroundColor: "rgba(34, 197, 94, 0.1)" };
}

/* ------------------------------------------------------------------ */
/*  Filter Bar                                                         */
/* ------------------------------------------------------------------ */

const LOOKBACK_OPTIONS = [3, 4, 5, 6, 7];

function FilterBar({
  selectedHub, wxRegion, selectedMonth, lookbackYears,
  onHubChange, onWxRegionChange, onMonthChange, onLookbackChange,
  onApply, loading,
}: {
  selectedHub: string;
  wxRegion: string;
  selectedMonth: number;
  lookbackYears: number;
  onHubChange: (hub: string) => void;
  onWxRegionChange: (region: string) => void;
  onMonthChange: (month: number) => void;
  onLookbackChange: (years: number) => void;
  onApply: () => void;
  loading: boolean;
}) {
  const selectClass =
    "rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-[12px] text-gray-300 focus:border-cyan-600 focus:outline-none";

  return (
    <div className="rounded-lg border border-gray-800 bg-[#0c0e15] p-4">
      <div className="flex flex-wrap items-end gap-4">
        {/* Gas Hub */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Gas Hub
          </label>
          <select
            value={selectedHub}
            onChange={(e) => onHubChange(e.target.value)}
            className={selectClass}
          >
            {HUBS.map((h) => (
              <option key={h.key} value={h.key}>{h.label}</option>
            ))}
          </select>
        </div>

        {/* Weather Region */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Weather Region
          </label>
          <select
            value={wxRegion}
            onChange={(e) => onWxRegionChange(e.target.value)}
            className={selectClass}
          >
            {WX_REGIONS.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Month */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Month
          </label>
          <select
            value={selectedMonth}
            onChange={(e) => onMonthChange(Number(e.target.value))}
            className={selectClass}
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
        </div>

        {/* Lookback Years */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Lookback Years
          </label>
          <select
            value={lookbackYears}
            onChange={(e) => onLookbackChange(Number(e.target.value))}
            className={selectClass}
          >
            {LOOKBACK_OPTIONS.map((y) => (
              <option key={y} value={y}>{y} years</option>
            ))}
          </select>
        </div>

        {/* Apply */}
        <button
          onClick={onApply}
          disabled={loading}
          className="rounded bg-cyan-700 px-4 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Load"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Data Table                                                         */
/* ------------------------------------------------------------------ */

function DataTable({
  rows, hubKey, wxRegion,
}: {
  rows: Row[];
  hubKey: string;
  wxRegion: string;
}) {
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead className="sticky top-0 z-10 bg-[#0f1117]">
          <tr className="border-b border-gray-700 text-[11px] font-semibold uppercase tracking-wider">
            <th className="py-2 px-2 text-left text-gray-500">Year</th>
            <th className="py-2 px-2 text-left text-gray-500">Month</th>
            <th className="py-2 px-2 text-left text-gray-500">Gas Day</th>
            <th className="py-2 px-2 text-right text-blue-400">GW HDD</th>
            <th className="py-2 px-2 text-right text-red-400">Normals</th>
            <th className="py-2 px-2 text-right text-red-400">DFN</th>
            <th className="py-2 px-2 text-right text-cyan-400">CASH</th>
            <th className="py-2 px-2 text-right text-cyan-400">BALMO</th>
            <th className="py-2 px-2 text-right text-cyan-400">CASH-BALMO</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const year = getNum(row, "year");
            const month = getNum(row, "month");
            const hdd = getNum(row, `${wxRegion}_gas_hdd`);
            const normals = getNum(row, `${wxRegion}_normals_gas_hdd`);
            const dfn = getNum(row, `${wxRegion}_dfn`);
            const cash = getNum(row, `${hubKey}_cash`);
            const balmo = getNum(row, `${hubKey}_balmo`);
            const cashBalmo = getNum(row, `${hubKey}_cash_balmo`);

            // Year separator line
            const prevYear = i > 0 ? getNum(rows[i - 1], "year") : year;
            const yearChanged = i > 0 && year !== prevYear;

            return (
              <tr
                key={i}
                className={`hover:bg-gray-800/30 ${yearChanged ? "border-t-2 border-gray-600" : "border-b border-gray-800/40"}`}
              >
                <td className="py-1 px-2 font-mono text-gray-500">{year}</td>
                <td className="py-1 px-2 font-mono text-gray-500">{month}</td>
                <td className="py-1 px-2 font-mono text-gray-300 whitespace-nowrap">
                  {formatGasDay(row.gas_day as string)}
                </td>
                <td className="py-1 px-2 text-right font-mono text-gray-300">
                  {hdd !== null ? hdd.toFixed(1) : "—"}
                </td>
                <td className="py-1 px-2 text-right font-mono text-gray-400">
                  {normals !== null ? normals.toFixed(1) : "—"}
                </td>
                <td className="py-1 px-2 text-right font-mono" style={dfnBgStyle(dfn)}>
                  <span className={dfn !== null && dfn > 0 ? "text-blue-300" : dfn !== null && dfn < 0 ? "text-red-300" : "text-gray-400"}>
                    {dfn !== null ? dfn.toFixed(1) : "—"}
                  </span>
                </td>
                <td className="py-1 px-2 text-right font-mono text-gray-300">{fmtPrice(cash)}</td>
                <td className="py-1 px-2 text-right font-mono text-gray-300">{fmtPrice(balmo)}</td>
                <td className="py-1 px-2 text-right font-mono" style={spreadBgStyle(cashBalmo)}>
                  <span className="text-gray-100">{fmtSpread(cashBalmo)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Scatter Chart                                                      */
/* ------------------------------------------------------------------ */

interface ChartPoint {
  x: number;
  y: number;
  gas_day: string;
  year: number;
}

function WxScatterChart({
  rows, hubKey, wxRegion, hubLabel, monthLabel,
}: {
  rows: Row[];
  hubKey: string;
  wxRegion: string;
  hubLabel: string;
  monthLabel: string;
}) {
  const { pointsByYear, recentPoints } = useMemo(() => {
    const byYear: Record<number, ChartPoint[]> = {};
    const recent: ChartPoint[] = [];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

    for (const row of rows) {
      const hdd = getNum(row, `${wxRegion}_gas_hdd`);
      const spread = getNum(row, `${hubKey}_cash_balmo`);
      if (hdd === null || spread === null) continue;
      const year = getNum(row, "year") ?? 0;
      const pt: ChartPoint = { x: hdd, y: spread, gas_day: row.gas_day as string, year };
      (byYear[year] ??= []).push(pt);

      const d = new Date(row.gas_day as string);
      if (d >= sevenDaysAgo) recent.push(pt);
    }
    return { pointsByYear: byYear, recentPoints: recent };
  }, [rows, hubKey, wxRegion]);

  const years = Object.keys(pointsByYear).map(Number).sort((a, b) => b - a);

  if (years.length === 0) {
    return <p className="p-4 text-sm text-gray-600">No chart data available for this selection.</p>;
  }

  return (
    <div className="flex flex-col">
      <h3 className="mb-2 text-center text-[13px] font-semibold text-gray-300">
        {hubLabel} - {monthLabel} - CASH-BALMO vs GW HDD
      </h3>
      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="x" type="number" name="GW HDD"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            label={{ value: `${wxRegion}_gas_hdd`, position: "bottom", offset: 10, fill: "#6b7280", fontSize: 11 }}
          />
          <YAxis
            dataKey="y" type="number" name="Cash-Balmo"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            label={{ value: `${hubKey}_cash_balmo`, angle: -90, position: "insideLeft", offset: 0, fill: "#6b7280", fontSize: 11 }}
          />
          <RTooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#9ca3af" }}
            formatter={(value: number, name: string) => [value.toFixed(3), name]}
            labelFormatter={(_, payload) => {
              if (payload?.[0]?.payload) {
                const p = payload[0].payload as ChartPoint;
                return `${formatGasDay(p.gas_day)} ${p.year}`;
              }
              return "";
            }}
          />
          <Legend
            verticalAlign="top" align="right" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
          />
          {years.map((year) => (
            <Scatter
              key={year}
              name={String(year)}
              data={pointsByYear[year]}
              fill={getYearColor(year)}
              r={4}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>

      {/* Recent points annotation */}
      {recentPoints.length > 0 && (
        <div className="mt-2 rounded border border-gray-800 bg-gray-900/60 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Last 7 Days</span>
          <div className="mt-1 flex flex-wrap gap-3">
            {recentPoints.map((pt, i) => (
              <span key={i} className="text-[11px] text-gray-400">
                <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: getYearColor(pt.year) }} />
                {formatGasDay(pt.gas_day)}: HDD={pt.x.toFixed(1)}, Spread={pt.y.toFixed(3)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function WxCashBalmoTable() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-12

  // Filter state
  const [selectedHub, setSelectedHub] = useState("hh");
  const [wxRegion, setWxRegion] = useState("conus");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [lookbackYears, setLookbackYears] = useState(5);

  // Applied filters (null = nothing loaded yet)
  const [applied, setApplied] = useState<{
    hub: string; wxRegion: string; month: number; lookbackYears: number;
  } | null>(null);

  // Data
  const cache = useRef<Map<string, Row[]>>(new Map());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-set wx region when hub changes
  const handleHubChange = useCallback((hub: string) => {
    setSelectedHub(hub);
    const hubDef = HUBS.find((h) => h.key === hub);
    if (hubDef) setWxRegion(hubDef.defaultWxRegion);
  }, []);

  const fetchData = useCallback(async (month: number, startYear: number) => {
    const key = `${month}-${startYear}`;
    if (cache.current.has(key)) {
      setRows(cache.current.get(key)!);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ice-wx-cash-balmo?month=${month}&startYear=${startYear}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const r = data.rows ?? [];
      cache.current.set(key, r);
      setRows(r);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleApply = useCallback(() => {
    const filters = { hub: selectedHub, wxRegion, month: selectedMonth, lookbackYears };
    setApplied(filters);
    const startYear = currentYear - lookbackYears;
    fetchData(filters.month, startYear);
  }, [selectedHub, wxRegion, selectedMonth, lookbackYears, currentYear, fetchData]);

  const hubDef = applied ? HUBS.find((h) => h.key === applied.hub) : null;
  const hubLabel = hubDef?.label ?? applied?.hub ?? "";
  const monthLabel = applied ? MONTH_NAMES[applied.month - 1] : "";

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <FilterBar
        selectedHub={selectedHub}
        wxRegion={wxRegion}
        selectedMonth={selectedMonth}
        lookbackYears={lookbackYears}
        onHubChange={handleHubChange}
        onWxRegionChange={setWxRegion}
        onMonthChange={setSelectedMonth}
        onLookbackChange={setLookbackYears}
        onApply={handleApply}
        loading={loading}
      />

      {/* Prompt before first load */}
      {!applied && !loading && (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-gray-600">
            Select filters above and click <span className="font-semibold text-gray-400">Load</span> to view data.
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading {MONTH_NAMES[selectedMonth - 1]} data...
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          Failed to load data: {error}
        </div>
      )}

      {/* Table + Chart */}
      {applied && !loading && !error && (
        <>
          <div className="flex h-[calc(100vh-320px)] overflow-hidden rounded-lg border border-gray-800">
            {/* Table panel */}
            <div className="flex-1 overflow-auto">
              <DataTable rows={rows} hubKey={applied.hub} wxRegion={applied.wxRegion} />
            </div>

            {/* Chart panel */}
            <div className="w-[480px] shrink-0 overflow-auto border-l border-gray-800 p-3">
              <WxScatterChart
                rows={rows}
                hubKey={applied.hub}
                wxRegion={applied.wxRegion}
                hubLabel={hubLabel}
                monthLabel={monthLabel}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
