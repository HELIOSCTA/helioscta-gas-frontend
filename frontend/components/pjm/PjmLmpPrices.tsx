"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import MultiSelect from "@/components/ui/MultiSelect";
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

/* ------------------------------------------------------------------ */
/*  sessionStorage helpers                                             */
/* ------------------------------------------------------------------ */

const CACHE_PREFIX = "pjm-lmp:";

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

interface LmpRow {
  datetime: string;
  date: string;
  hour_ending: number;
  hub: string;
  market: string;
  lmp_total: number;
  lmp_system_energy_price: number;
  lmp_congestion_price: number;
  lmp_marginal_loss_price: number;
}

interface FiltersResponse {
  hubs: string[];
  markets: string[];
  dateRange: { min: string; max: string };
}

type SortField = keyof LmpRow;
type SortDir = "asc" | "desc";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 100;
const DEFAULT_LOOKBACK = 7;

const HUB_COLORS = [
  "#3b82f6", // blue
  "#f97316", // orange
  "#22c55e", // green
  "#eab308", // yellow
  "#a855f7", // purple
  "#ef4444", // red
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
  "#f59e0b", // amber
];

const MARKET_OPTIONS = [
  { value: "da", label: "Day-Ahead" },
  { value: "rt", label: "Real-Time" },
  { value: "dart", label: "DA-RT Spread" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function lookbackDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmtNum(val: number | null | undefined): string {
  if (val == null) return "--";
  return Number(val).toFixed(2);
}

function fmtDateShort(ts: string): string {
  const d = new Date(ts + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function downloadCsv(rows: LmpRow[]) {
  const header = "Date,Hour,Hub,Market,LMP Total,System Energy,Congestion,Marginal Loss";
  const csvRows = rows.map((r) =>
    [
      r.date,
      r.hour_ending,
      `"${r.hub}"`,
      r.market,
      fmtNum(r.lmp_total),
      fmtNum(r.lmp_system_energy_price),
      fmtNum(r.lmp_congestion_price),
      fmtNum(r.lmp_marginal_loss_price),
    ].join(",")
  );
  const csv = [header, ...csvRows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pjm_lmp_${todayStr()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

interface ColumnDef {
  key: SortField;
  label: string;
  format?: (row: LmpRow) => string;
  className?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: "date", label: "Date" },
  { key: "hour_ending", label: "Hour", className: "text-right" },
  { key: "hub", label: "Hub" },
  { key: "market", label: "Market" },
  {
    key: "lmp_total",
    label: "LMP Total ($/MWh)",
    format: (r) => fmtNum(r.lmp_total),
    className: "text-right",
  },
  {
    key: "lmp_system_energy_price",
    label: "System Energy",
    format: (r) => fmtNum(r.lmp_system_energy_price),
    className: "text-right",
  },
  {
    key: "lmp_congestion_price",
    label: "Congestion",
    format: (r) => fmtNum(r.lmp_congestion_price),
    className: "text-right",
  },
  {
    key: "lmp_marginal_loss_price",
    label: "Marginal Loss",
    format: (r) => fmtNum(r.lmp_marginal_loss_price),
    className: "text-right",
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PjmLmpPrices() {
  // Filter options from API
  const [filterOpts, setFilterOpts] = useState<FiltersResponse | null>(null);

  // Filter state
  const [startDate, setStartDate] = useState(() => cacheGet<string>("start") ?? lookbackDate(DEFAULT_LOOKBACK));
  const [endDate, setEndDate] = useState(() => cacheGet<string>("end") ?? todayStr());
  const [selectedHubs, setSelectedHubs] = useState<string[]>(() => cacheGet<string[]>("hubs") ?? []);
  const [selectedMarket, setSelectedMarket] = useState(() => cacheGet<string>("market") ?? "da");

  // Data state
  const [rows, setRows] = useState<LmpRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination & sorting
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Persist filter state
  useEffect(() => { cacheSet("start", startDate); }, [startDate]);
  useEffect(() => { cacheSet("end", endDate); }, [endDate]);
  useEffect(() => { cacheSet("hubs", selectedHubs); }, [selectedHubs]);
  useEffect(() => { cacheSet("market", selectedMarket); }, [selectedMarket]);

  // Fetch filter options on mount
  useEffect(() => {
    fetch("/api/pjm/lmps/filters")
      .then((r) => r.json())
      .then((data: FiltersResponse) => {
        setFilterOpts(data);
        // Auto-select first hub if none cached
        if (selectedHubs.length === 0 && data.hubs.length > 0) {
          setSelectedHubs([data.hubs[0]]);
        }
      })
      .catch((err) => console.error("Failed to load PJM filters:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch data when filters change
  const fetchData = useCallback(() => {
    if (selectedHubs.length === 0) return;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      start: startDate,
      end: endDate,
      hub: selectedHubs.join(","),
      market: selectedMarket,
      limit: "5000",
      offset: "0",
    });

    fetch(`/api/pjm/lmps?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setRows(data.rows ?? []);
        setTotalCount(data.totalCount ?? 0);
        setPage(0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [startDate, endDate, selectedHubs, selectedMarket]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Chart data: aggregate hourly → daily average by hub
  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, { sum: number; count: number }>>();
    for (const row of rows) {
      let entry = byDate.get(row.date);
      if (!entry) {
        entry = {};
        byDate.set(row.date, entry);
      }
      if (!entry[row.hub]) {
        entry[row.hub] = { sum: 0, count: 0 };
      }
      entry[row.hub].sum += row.lmp_total;
      entry[row.hub].count += 1;
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, hubs]) => {
        const point: Record<string, string | number> = { date: fmtDateShort(date) };
        for (const hub of selectedHubs) {
          const h = hubs[hub];
          point[hub] = h ? Number((h.sum / h.count).toFixed(2)) : 0;
        }
        return point;
      });
  }, [rows, selectedHubs]);

  // Sorted + paginated rows for table
  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal == null || bVal == null) return 0;
      const cmp = typeof aVal === "number" && typeof bVal === "number"
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, sortField, sortDir]);

  const pageRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Filters ── */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
          />
        </div>

        <MultiSelect
          label="Hubs"
          options={filterOpts?.hubs ?? []}
          selected={selectedHubs}
          onChange={setSelectedHubs}
          placeholder="Select hubs..."
          width="w-56"
        />

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Market
          </label>
          <div className="flex gap-1">
            {MARKET_OPTIONS.map((m) => (
              <button
                key={m.value}
                onClick={() => setSelectedMarket(m.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedMarket === m.value
                    ? "bg-amber-600 text-white"
                    : "border border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => downloadCsv(sortedRows)}
          disabled={sortedRows.length === 0}
          className="ml-auto rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {/* ── Status ── */}
      {loading && <p className="text-sm text-gray-500">Loading PJM LMP data...</p>}
      {error && <p className="text-sm text-red-400">Error: {error}</p>}
      {!loading && !error && rows.length === 0 && selectedHubs.length > 0 && (
        <p className="text-sm text-gray-500">No data found for the selected filters.</p>
      )}
      {!loading && selectedHubs.length === 0 && (
        <p className="text-sm text-gray-500">Select at least one hub to view data.</p>
      )}

      {/* ── Chart ── */}
      {chartData.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
            Daily Avg LMP ($/MWh) &mdash; {MARKET_OPTIONS.find((m) => m.value === selectedMarket)?.label ?? selectedMarket}
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111827",
                  border: "1px solid #374151",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#9ca3af" }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: "#9ca3af" }}
              />
              {selectedHubs.map((hub, i) => (
                <Line
                  key={hub}
                  type="monotone"
                  dataKey={hub}
                  name={hub}
                  stroke={HUB_COLORS[i % HUB_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Table ── */}
      {pageRows.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sortedRows.length)} of{" "}
              {sortedRows.length.toLocaleString()} rows (total: {totalCount.toLocaleString()})
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded border border-gray-700 px-2 py-1 hover:bg-gray-800 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded border border-gray-700 px-2 py-1 hover:bg-gray-800 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className={`cursor-pointer whitespace-nowrap px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300 ${col.className ?? ""}`}
                    >
                      {col.label}
                      {sortField === col.key && (
                        <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr
                    key={`${row.date}-${row.hour_ending}-${row.hub}-${i}`}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30"
                  >
                    {COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`whitespace-nowrap px-4 py-1.5 text-gray-300 ${col.className ?? ""}`}
                      >
                        {col.format ? col.format(row) : String(row[col.key] ?? "--")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
