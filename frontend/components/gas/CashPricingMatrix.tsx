"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

type RawRow = Record<string, unknown>;

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// NYMEX month codes: F=Jan, G=Feb, H=Mar, J=Apr, K=May, M=Jun,
//                    N=Jul, Q=Aug, U=Sep, V=Oct, X=Nov, Z=Dec
const MONTH_CODES = ["F","G","H","J","K","M","N","Q","U","V","X","Z"];
const CODE_TO_MONTH: Record<string, number> = {};
MONTH_CODES.forEach((c, i) => { CODE_TO_MONTH[c] = i; });

interface HubDef {
  key: string;
  label: string;
}

const HUBS: HubDef[] = [
  { key: "hh", label: "Henry Hub" },
  { key: "transco_st85", label: "Transco ST85" },
  { key: "waha", label: "Waha" },
  { key: "transco_z5s", label: "Transco Z5S" },
  { key: "tetco_m3", label: "Tetco M3" },
  { key: "agt", label: "AGT" },
  { key: "iroquois_z2", label: "Iroquois Z2" },
  { key: "socal_cg", label: "Socal CG" },
  { key: "pge_cg", label: "PG&E CG" },
  { key: "cig", label: "CIG" },
];

/* ------------------------------------------------------------------ */
/*  Contract code helpers                                              */
/* ------------------------------------------------------------------ */

/** Parse "J26" → { monthIdx: 3, year: 26 } */
function parseContractCode(code: string): { monthIdx: number; year: number } | null {
  if (!code || code.length < 2) return null;
  const letter = code[0];
  const yearNum = parseInt(code.substring(1));
  const monthIdx = CODE_TO_MONTH[letter];
  if (monthIdx === undefined || !Number.isFinite(yearNum)) return null;
  return { monthIdx, year: yearNum };
}

/** Generate 12-month strip from prompt contract code. Returns codes + labels. */
function generateStrip(promptCode: string, count: number = 12): { code: string; label: string }[] {
  const parsed = parseContractCode(promptCode);
  if (!parsed) return [];

  const strip: { code: string; label: string }[] = [];
  let mi = parsed.monthIdx;
  let yr = parsed.year;

  for (let i = 0; i < count; i++) {
    const code = MONTH_CODES[mi] + yr;
    const label = `${MONTH_NAMES[mi]}-${String(yr).padStart(2, "0")}`;
    strip.push({ code, label });
    mi++;
    if (mi >= 12) { mi = 0; yr++; }
  }
  return strip;
}

/** Get month offset of a contract_code relative to prompt. Returns -1 if not in strip. */
function getStripIndex(contractCode: string, strip: { code: string }[]): number {
  return strip.findIndex((s) => s.code === contractCode);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt3(v: number | null): string {
  if (v === null) return "—";
  return v.toFixed(3);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/*  Data processing: pivot raw rows into matrix                        */
/* ------------------------------------------------------------------ */

interface MatrixRow {
  tradeDate: string;
  cash: number | null;
  balmo: number | null;
  futures: (number | null)[]; // indexed by strip position (0=prompt, 1=prompt+1, ...)
}

function buildMatrix(rawRows: RawRow[], isBasis: boolean, selectedMonth: number, selectedYear: number): { matrix: MatrixRow[]; strip: { code: string; label: string }[] } {
  if (rawRows.length === 0) return { matrix: [], strip: [] };

  // Prompt month = selected month + 1 (e.g. March selected → April prompt)
  const promptMonthIdx = selectedMonth % 12; // 0-based: Mar(3)→3=Apr, Dec(12)→0=Jan
  const promptYear2 = selectedMonth === 12 ? (selectedYear % 100) + 1 : selectedYear % 100;
  const promptCode = MONTH_CODES[promptMonthIdx] + promptYear2;

  const strip = generateStrip(promptCode, 12);

  // Group by trade_date
  const byDate = new Map<string, { cash: number | null; balmo: number | null; futures: (number | null)[] }>();

  for (const row of rawRows) {
    const td = row.trade_date as string;
    if (!byDate.has(td)) {
      byDate.set(td, {
        cash: toNum(row.cash),
        balmo: toNum(row.balmo),
        futures: new Array(strip.length).fill(null),
      });
    }

    const entry = byDate.get(td)!;
    const cc = row.contract_code as string | null;
    if (!cc) continue;

    const idx = getStripIndex(cc, strip);
    if (idx < 0) continue;

    // Compute outright price
    const hhVal = toNum(row.hh_value);
    if (isBasis) {
      const basisVal = toNum(row.basis_value);
      if (hhVal !== null && basisVal !== null) {
        entry.futures[idx] = hhVal + basisVal;
      }
    } else {
      // HH: outright = hh_value directly
      entry.futures[idx] = hhVal;
    }
  }

  // Sort by trade_date ascending
  const sortedDates = [...byDate.keys()].sort((a, b) => a.localeCompare(b));
  const matrix: MatrixRow[] = sortedDates.map((td) => ({
    tradeDate: td,
    ...byDate.get(td)!,
  }));

  return { matrix, strip };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CashPricingMatrix() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [hub, setHub] = useState("hh");
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [isBasis, setIsBasis] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef<Map<string, { rows: RawRow[]; isBasis: boolean }>>(new Map());
  const [displayMode, setDisplayMode] = useState<"outright" | "spread">("outright");

  const fetchData = useCallback(async (m: number, y: number, h: string) => {
    const key = `${m}-${y}-${h}`;
    if (cache.current.has(key)) {
      const cached = cache.current.get(key)!;
      setRawRows(cached.rows);
      setIsBasis(cached.isBasis);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ice-cash-pricing-matrix?month=${m}&year=${y}&hub=${h}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows = data.rows ?? [];
      const basis = data.isBasis ?? false;
      cache.current.set(key, { rows, isBasis: basis });
      setRawRows(rows);
      setIsBasis(basis);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(month, year, hub);
  }, [month, year, hub, fetchData]);

  // Build the matrix from raw data
  const { matrix, strip } = useMemo(() => buildMatrix(rawRows, isBasis, month, year), [rawRows, isBasis, month, year]);

  // Compute averages
  const averages = useMemo(() => {
    if (matrix.length === 0) return null;

    let cashSum = 0, cashN = 0;
    let balmoSum = 0, balmoN = 0;
    const futSums = new Array(strip.length).fill(0);
    const futNs = new Array(strip.length).fill(0);

    for (const row of matrix) {
      if (row.cash !== null) { cashSum += row.cash; cashN++; }
      if (row.balmo !== null) { balmoSum += row.balmo; balmoN++; }
      for (let i = 0; i < strip.length; i++) {
        if (row.futures[i] !== null) { futSums[i] += row.futures[i]!; futNs[i]++; }
      }
    }

    return {
      cash: cashN > 0 ? cashSum / cashN : null,
      balmo: balmoN > 0 ? balmoSum / balmoN : null,
      futures: futSums.map((s: number, i: number) => futNs[i] > 0 ? s / futNs[i] : null) as (number | null)[],
    };
  }, [matrix, strip.length]);

  // Build chart data: one data point per strip month, one line per trade date (latest first for legend)
  const { chartData, chartLines } = useMemo(() => {
    if (matrix.length === 0 || strip.length === 0) return { chartData: [], chartLines: [] };

    const data = strip.map((s, i) => {
      const point: Record<string, string | number | undefined> = { month: s.label };
      for (const row of matrix) {
        if (row.futures[i] !== null) {
          point[row.tradeDate] = row.futures[i]!;
        }
      }
      return point;
    });

    // Reverse so latest dates appear first in legend
    const lines = [...matrix].reverse().map((row) => ({
      key: row.tradeDate,
      label: formatDate(row.tradeDate),
    }));

    return { chartData: data, chartLines: lines };
  }, [matrix, strip]);

  // Build spread-to-cash chart data: cash - futures[i] per trade date
  const spreadChartData = useMemo(() => {
    if (matrix.length === 0 || strip.length === 0) return [];

    return strip.map((s, i) => {
      const point: Record<string, string | number | undefined> = { month: s.label };
      for (const row of matrix) {
        if (row.cash !== null && row.futures[i] !== null) {
          point[row.tradeDate] = row.cash - row.futures[i]!;
        }
      }
      return point;
    });
  }, [matrix, strip]);

  // Track which chart lines are hidden — default: all except 3 most recent
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (chartLines.length === 0) return;
    // chartLines is already sorted latest-first, so hide everything after index 2
    const hidden = new Set<string>();
    for (let i = 3; i < chartLines.length; i++) {
      hidden.add(chartLines[i].key);
    }
    setHiddenLines(hidden);
  }, [chartLines]);

  const handleLegendClick = useCallback((dataKey: string) => {
    setHiddenLines((prev) => {
      const next = new Set(prev);
      if (next.has(dataKey)) next.delete(dataKey);
      else next.add(dataKey);
      return next;
    });
  }, []);

  const yearOptions = useMemo(() => {
    const opts: number[] = [];
    for (let y = now.getFullYear(); y >= 2024; y--) opts.push(y);
    return opts;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Color palette for chart lines (enough for ~23 trading days in a month)
  const LINE_COLORS = [
    "#06b6d4","#f59e0b","#10b981","#ef4444","#8b5cf6",
    "#ec4899","#14b8a6","#f97316","#6366f1","#84cc16",
    "#e879f9","#22d3ee","#fbbf24","#34d399","#fb7185",
    "#a78bfa","#f472b6","#2dd4bf","#fb923c","#818cf8",
    "#a3e635","#c084fc","#67e8f9",
  ];

  const selectClass =
    "rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-[12px] text-gray-300 focus:border-cyan-600 focus:outline-none";

  const thBase = "py-2 px-2 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap";
  const tdBase = "py-1 px-2 text-right font-mono text-[13px]";

  const spreadColor = (v: number | null) => {
    if (v === null) return "text-gray-300";
    if (v > 0) return "text-green-400";
    if (v < 0) return "text-red-400";
    return "text-gray-300";
  };

  const computeSpread = (cash: number | null, fut: number | null): number | null => {
    if (cash === null || fut === null) return null;
    return cash - fut;
  };

  const fmtSpread = (v: number | null): string => {
    if (v === null) return "—";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(3)}`;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="rounded-lg border border-gray-800 bg-[#0c0e15] p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Hub</label>
            <select value={hub} onChange={(e) => setHub(e.target.value)} className={selectClass}>
              {HUBS.map((h) => (
                <option key={h.key} value={h.key}>{h.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Month</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectClass}>
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Year</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectClass}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading...
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          Failed to load data: {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && matrix.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-gray-600">No data available for {HUBS.find((h) => h.key === hub)?.label} — {MONTH_NAMES[month - 1]} {year}.</p>
        </div>
      )}

      {/* Outright Price chart */}
      {!loading && chartData.length > 0 && chartLines.length > 0 && (
        <div className="rounded-lg border border-gray-800 bg-[#0c0e15] p-4">
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-500">
            Outright Price
          </h3>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
              <XAxis
                dataKey="month"
                tick={{ fill: "#9ca3af", fontSize: 10 }}
                axisLine={{ stroke: "#374151" }}
                tickLine={{ stroke: "#374151" }}
              />
              <YAxis
                tick={{ fill: "#9ca3af", fontSize: 10 }}
                axisLine={{ stroke: "#374151" }}
                tickLine={{ stroke: "#374151" }}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => v.toFixed(2)}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 6, fontSize: 12 }}
                labelStyle={{ color: "#d1d5db", fontWeight: 600 }}
                itemStyle={{ padding: 0 }}
                formatter={(value: number) => [`$${value.toFixed(3)}`]}
              />
              <Legend
                wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                iconType="line"
                iconSize={10}
                onClick={(e) => {
                  const key = chartLines.find((l) => l.label === e.value)?.key;
                  if (key) handleLegendClick(key);
                }}
                formatter={(value: string) => {
                  const key = chartLines.find((l) => l.label === value)?.key;
                  const isHidden = key ? hiddenLines.has(key) : false;
                  return <span style={{ color: isHidden ? "#4b5563" : "#d1d5db", cursor: "pointer" }}>{value}</span>;
                }}
              />
              {chartLines.map((line, i) => {
                const color = LINE_COLORS[i % LINE_COLORS.length];
                const hidden = hiddenLines.has(line.key);
                return (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    name={line.label}
                    stroke={color}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                    hide={hidden}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Spread to Cash chart */}
      {!loading && spreadChartData.length > 0 && chartLines.length > 0 && (
        <div className="rounded-lg border border-gray-800 bg-[#0c0e15] p-4">
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-500">
            Spread to Cash
          </h3>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={spreadChartData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
              <XAxis
                dataKey="month"
                tick={{ fill: "#9ca3af", fontSize: 10 }}
                axisLine={{ stroke: "#374151" }}
                tickLine={{ stroke: "#374151" }}
              />
              <YAxis
                tick={{ fill: "#9ca3af", fontSize: 10 }}
                axisLine={{ stroke: "#374151" }}
                tickLine={{ stroke: "#374151" }}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => v.toFixed(2)}
              />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 6, fontSize: 12 }}
                labelStyle={{ color: "#d1d5db", fontWeight: 600 }}
                itemStyle={{ padding: 0 }}
                formatter={(value: number) => {
                  const sign = value > 0 ? "+" : "";
                  return [`${sign}${value.toFixed(3)}`];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                iconType="line"
                iconSize={10}
                onClick={(e) => {
                  const key = chartLines.find((l) => l.label === e.value)?.key;
                  if (key) handleLegendClick(key);
                }}
                formatter={(value: string) => {
                  const key = chartLines.find((l) => l.label === value)?.key;
                  const isHidden = key ? hiddenLines.has(key) : false;
                  return <span style={{ color: isHidden ? "#4b5563" : "#d1d5db", cursor: "pointer" }}>{value}</span>;
                }}
              />
              {chartLines.map((line, i) => {
                const color = LINE_COLORS[i % LINE_COLORS.length];
                const hidden = hiddenLines.has(line.key);
                return (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    name={line.label}
                    stroke={color}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                    hide={hidden}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Matrix table */}
      {!loading && matrix.length > 0 && strip.length > 0 && (
        <div className="overflow-auto rounded-lg border border-gray-800">
          {/* Display mode toggle */}
          <div className="flex items-center gap-1 border-b border-gray-800 bg-[#0f1117] px-3 py-2">
            <span className="mr-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Display</span>
            <button
              onClick={() => setDisplayMode("outright")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                displayMode === "outright"
                  ? "bg-cyan-600/20 text-cyan-400 border border-cyan-600/40"
                  : "text-gray-500 hover:text-gray-300 border border-transparent"
              }`}
            >
              Outright
            </button>
            <button
              onClick={() => setDisplayMode("spread")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                displayMode === "spread"
                  ? "bg-cyan-600/20 text-cyan-400 border border-cyan-600/40"
                  : "text-gray-500 hover:text-gray-300 border border-transparent"
              }`}
            >
              Spread to Cash
            </button>
          </div>
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 bg-[#0f1117]">
              <tr className="border-b border-gray-700">
                <th className={`${thBase} text-left text-gray-500`}>DATE</th>
                <th className={`${thBase} text-right text-cyan-400 border-l border-gray-700`}>CASH</th>
                <th className={`${thBase} text-right text-cyan-400`}>BALMO</th>
                {strip.map((s, i) => (
                  <th
                    key={s.code}
                    className={`${thBase} text-right border-l border-gray-700 ${i === 0 ? "text-yellow-400" : "text-gray-400"}`}
                  >
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {matrix.map((row) => (
                <tr key={row.tradeDate} className="border-b border-gray-800/40 hover:bg-gray-800/30">
                  <td className="py-1 px-2 font-mono text-gray-300 whitespace-nowrap">
                    {formatDate(row.tradeDate)}
                  </td>
                  <td className={`${tdBase} text-gray-300 border-l border-gray-800`}>{fmt3(row.cash)}</td>
                  <td className={`${tdBase} text-gray-300`}>{fmt3(row.balmo)}</td>
                  {row.futures.map((val, i) => {
                    if (displayMode === "spread") {
                      const sp = computeSpread(row.cash, val);
                      return (
                        <td key={strip[i].code} className={`${tdBase} border-l border-gray-800 ${spreadColor(sp)}`}>
                          {fmtSpread(sp)}
                        </td>
                      );
                    }
                    return (
                      <td
                        key={strip[i].code}
                        className={`${tdBase} border-l border-gray-800 ${i === 0 ? "text-yellow-300/80" : "text-gray-300"}`}
                      >
                        {fmt3(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Average row */}
              {averages && (
                <tr className="border-t-2 border-gray-600 bg-gray-900/80 font-semibold">
                  <td className="py-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                    AVERAGE
                  </td>
                  <td className={`${tdBase} text-gray-300 border-l border-gray-800`}>{fmt3(averages.cash)}</td>
                  <td className={`${tdBase} text-gray-300`}>{fmt3(averages.balmo)}</td>
                  {averages.futures.map((val, i) => {
                    if (displayMode === "spread") {
                      const sp = computeSpread(averages.cash, val);
                      return (
                        <td key={strip[i].code} className={`${tdBase} border-l border-gray-800 ${spreadColor(sp)}`}>
                          {fmtSpread(sp)}
                        </td>
                      );
                    }
                    return (
                      <td
                        key={strip[i].code}
                        className={`${tdBase} border-l border-gray-800 ${i === 0 ? "text-yellow-300/80" : "text-gray-300"}`}
                      >
                        {fmt3(val)}
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
