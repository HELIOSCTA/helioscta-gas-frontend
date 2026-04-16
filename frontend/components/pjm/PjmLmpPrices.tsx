"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PARQUET_REFRESH_EVENT,
  type ParquetRefreshDetail,
} from "@/components/ParquetMetaStrip";
import {
  ComposedChart,
  Line,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const CURATED_ORDER = ["WESTERN HUB", "DOMINION HUB", "AEP-DAYTON HUB"];

function orderHubs(all: string[]): string[] {
  const curated = CURATED_ORDER.filter((h) => all.includes(h));
  const rest = all.filter((h) => !curated.includes(h)).sort();
  return [...curated, ...rest];
}

interface LmpRow {
  date: string;
  hour_ending: number;
  hub: string;
  market: string;
  lmp_total: number;
  lmp_system_energy_price: number;
  lmp_congestion_price: number;
  lmp_marginal_loss_price: number;
}

type Market = "da" | "rt" | "dart";
const MARKETS: Market[] = ["da", "rt", "dart"];
const MARKET_LABEL: Record<Market, string> = {
  da: "DA",
  rt: "RT",
  dart: "DART",
};
const MARKET_COLOR: Record<Market, string> = {
  da: "#60a5fa",
  rt: "#fb923c",
  dart: "#facc15",
};

const POS_COLOR = "#4ade80";
const NEG_COLOR = "#f87171";

type ComponentKey =
  | "lmp_total"
  | "lmp_system_energy_price"
  | "lmp_congestion_price";

const COMPONENTS: { key: ComponentKey; label: string }[] = [
  { key: "lmp_total", label: "LMP Total" },
  { key: "lmp_system_energy_price", label: "System Energy" },
  { key: "lmp_congestion_price", label: "Congestion" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i + 1);
const CHART_HEIGHT = 280;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtNum(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "--";
  return val.toFixed(2);
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  return day === 0 || day === 6;
}

function isPeakHour(h: number): boolean {
  return h >= 8 && h <= 23;
}

function mean(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function dartColor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "text-gray-400";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-rose-400";
  return "text-[#dbe7ff]";
}

function dartBarFill(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "transparent";
  return v >= 0 ? POS_COLOR : NEG_COLOR;
}

function abbrevTick(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  if (v <= -1000) return `${(v / 1000).toFixed(0)}k`;
  return String(v);
}

type HubLookup = Map<Market, Map<number, LmpRow>>;

type Overrides = Record<
  string,
  Partial<Record<ComponentKey, Record<number, number>>>
>;

type Resolved = { value: number | null; edited: boolean };

function resolve(
  hubData: HubLookup,
  rtOverrides: Record<number, number>,
  mkt: Market,
  key: ComponentKey,
  hour: number
): Resolved {
  if (mkt === "rt") {
    const actual = hubData.get("rt")?.get(hour);
    if (actual) return { value: actual[key], edited: false };
    const ov = rtOverrides[hour];
    if (ov != null) return { value: ov, edited: true };
    return { value: null, edited: false };
  }

  if (mkt === "da") {
    const r = hubData.get("da")?.get(hour);
    return { value: r ? r[key] : null, edited: false };
  }

  const actual = hubData.get("dart")?.get(hour);
  if (actual) return { value: actual[key], edited: false };
  const da = hubData.get("da")?.get(hour);
  const rtActual = hubData.get("rt")?.get(hour);
  const rtOv = rtOverrides[hour];
  const rtVal = rtActual ? rtActual[key] : rtOv;
  if (da && rtVal != null) {
    return { value: da[key] - rtVal, edited: !rtActual && rtOv != null };
  }
  return { value: null, edited: false };
}

function ChartCard({
  title,
  height,
  children,
}: {
  title: string;
  height: number;
  children: (opts: {
    chartHeight: number;
    hiddenSeries: Set<string>;
    toggleSeries: (key: string) => void;
  }) => React.ReactNode;
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
        <h5 className="text-sm font-medium text-slate-400">{title}</h5>
        <button
          onClick={() => setFocused((v) => !v)}
          className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
            focused
              ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
              : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
          }`}
        >
          {focused ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
              />
            </svg>
          )}
          {focused ? "Collapse" : "Focus"}
        </button>
      </div>
      {children({
        chartHeight: focused ? 600 : height,
        hiddenSeries,
        toggleSeries,
      })}
    </div>
  );

  if (!focused) return card;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) setFocused(false);
      }}
    >
      <div className="w-full max-w-[1400px]">{card}</div>
    </div>
  );
}

function LegendItem({
  seriesKey,
  label,
  color,
  dash,
  type = "line",
  hiddenSeries,
  toggleSeries,
}: {
  seriesKey: string;
  label: string;
  color: string;
  dash?: string;
  type?: "line" | "square";
  hiddenSeries: Set<string>;
  toggleSeries: (key: string) => void;
}) {
  const hidden = hiddenSeries.has(seriesKey);
  return (
    <button
      onClick={() => toggleSeries(seriesKey)}
      className={`flex cursor-pointer items-center gap-1.5 text-slate-400 transition-opacity hover:text-slate-200 ${
        hidden ? "line-through opacity-35" : ""
      }`}
    >
      {type === "square" ? (
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm"
          style={{ background: color }}
        />
      ) : (
        <span
          className="inline-block h-0.5 w-4 rounded"
          style={{
            background: color,
            borderTop: dash ? `2px dashed ${color}` : undefined,
            height: dash ? 0 : undefined,
          }}
        />
      )}
      {label}
    </button>
  );
}

export default function PjmLmpPrices() {
  const [date, setDate] = useState<string>(todayStr());
  const [hubs, setHubs] = useState<string[]>([]);
  const [rowsByDate, setRowsByDate] = useState<Map<string, LmpRow[]>>(
    () => new Map()
  );
  const [loadingDates, setLoadingDates] = useState<Set<string>>(
    () => new Set()
  );
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Overrides>({});

  const rows = rowsByDate.get(date) ?? [];
  const loading = loadingDates.has(date);

  useEffect(() => {
    fetch("/api/pjm/lmps/filters")
      .then((r) => r.json())
      .then((data) => {
        const ordered = orderHubs(data.hubs ?? []);
        setHubs(ordered);
        if (ordered.length > 0) setExpanded({ [ordered[0]]: true });
      })
      .catch((err) => setError(err.message));
  }, []);

  // Listen for global parquet refresh events from ParquetMetaStrip
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ParquetRefreshDetail>).detail;
      if (detail?.dataset === "pjm-lmps") {
        setRowsByDate(new Map());
      }
    };
    window.addEventListener(PARQUET_REFRESH_EVENT, handler);
    return () => window.removeEventListener(PARQUET_REFRESH_EVENT, handler);
  }, []);

  useEffect(() => {
    if (hubs.length === 0) return;
    if (rowsByDate.has(date)) return;
    if (loadingDates.has(date)) return;

    setLoadingDates((prev) => {
      const next = new Set(prev);
      next.add(date);
      return next;
    });
    setError(null);

    const params = new URLSearchParams({
      start: date,
      end: date,
      hub: hubs.join(","),
      limit: "5000",
      offset: "0",
    });

    fetch(`/api/pjm/lmps?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setRowsByDate((prev) => {
          const next = new Map(prev);
          next.set(date, data.rows ?? []);
          return next;
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        setLoadingDates((prev) => {
          const next = new Set(prev);
          next.delete(date);
          return next;
        });
      });
  }, [hubs, date, rowsByDate, loadingDates]);

  useEffect(() => {
    setOverrides({});
  }, [date]);

  const lookup = useMemo(() => {
    const out = new Map<string, HubLookup>();
    for (const row of rows) {
      let byMkt = out.get(row.hub);
      if (!byMkt) {
        byMkt = new Map();
        out.set(row.hub, byMkt);
      }
      const mkt = row.market as Market;
      let byHr = byMkt.get(mkt);
      if (!byHr) {
        byHr = new Map();
        byMkt.set(mkt, byHr);
      }
      byHr.set(row.hour_ending, row);
    }
    return out;
  }, [rows]);

  const toggle = (hub: string) =>
    setExpanded((p) => ({ ...p, [hub]: !p[hub] }));

  const handleOverrideChange = (
    hub: string,
    componentKey: ComponentKey,
    hour: number,
    value: number | null
  ) => {
    setOverrides((prev) => {
      const next = { ...prev };
      const hubOv: Partial<Record<ComponentKey, Record<number, number>>> = {
        ...(next[hub] ?? {}),
      };
      const compOv: Record<number, number> = { ...(hubOv[componentKey] ?? {}) };
      if (value == null) {
        delete compOv[hour];
      } else {
        compOv[hour] = value;
      }
      hubOv[componentKey] = compOv;
      next[hub] = hubOv;
      return next;
    });
  };

  const handleClearInputs = (hub: string, componentKey: ComponentKey) => {
    setOverrides((prev) => {
      const next = { ...prev };
      const hubOv: Partial<Record<ComponentKey, Record<number, number>>> = {
        ...(next[hub] ?? {}),
      };
      delete hubOv[componentKey];
      next[hub] = hubOv;
      return next;
    });
  };

  const handleSetToDa = (hub: string, componentKey: ComponentKey) => {
    const hubData = lookup.get(hub);
    if (!hubData) return;
    setOverrides((prev) => {
      const next = { ...prev };
      const hubOv: Partial<Record<ComponentKey, Record<number, number>>> = {
        ...(next[hub] ?? {}),
      };
      const newCompOv: Record<number, number> = {};
      for (const h of HOURS) {
        if (hubData.get("rt")?.get(h)) continue;
        const da = hubData.get("da")?.get(h);
        if (da) newCompOv[h] = da[componentKey];
      }
      hubOv[componentKey] = newCompOv;
      next[hub] = hubOv;
      return next;
    });
  };

  const weekend = isWeekend(date);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-100">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-white focus:outline-none sm:w-auto sm:py-1.5"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              setExpanded(Object.fromEntries(hubs.map((h) => [h, true])))
            }
            className="flex-1 rounded-md border border-gray-600 px-3 py-2 text-sm font-semibold text-gray-100 hover:bg-gray-800 hover:text-white sm:flex-none sm:py-1.5"
          >
            Expand all
          </button>
          <button
            onClick={() => setExpanded({})}
            className="flex-1 rounded-md border border-gray-600 px-3 py-2 text-sm font-semibold text-gray-100 hover:bg-gray-800 hover:text-white sm:flex-none sm:py-1.5"
          >
            Collapse all
          </button>
          <button
            onClick={() => setOverrides({})}
            disabled={Object.keys(overrides).length === 0}
            className="flex-1 rounded-md border border-amber-500/50 px-3 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-40 sm:flex-none sm:py-1.5"
          >
            Clear RT inputs
          </button>
        </div>
        {loading && <span className="text-sm text-gray-200">Loading...</span>}
        {error && <span className="text-sm text-rose-400">Error: {error}</span>}
      </div>

      <div className="space-y-2">
        {hubs.map((hub) => {
          const isOpen = !!expanded[hub];
          const hubData = lookup.get(hub);
          const hubOv = overrides[hub] ?? {};

          const headerRtOv = hubOv.lmp_total ?? {};
          const mktAvg = (mkt: Market): number | null => {
            if (!hubData) return null;
            const vals: number[] = [];
            for (const h of HOURS) {
              const { value } = resolve(
                hubData,
                headerRtOv,
                mkt,
                "lmp_total",
                h
              );
              if (value != null) vals.push(value);
            }
            return mean(vals);
          };

          const daTot = mktAvg("da");
          const rtTot = mktAvg("rt");
          const dartTot = mktAvg("dart");

          return (
            <div
              key={hub}
              className="rounded-lg border border-gray-700 bg-gray-900"
            >
              <button
                onClick={() => toggle(hub)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-800/50"
              >
                <span className="text-sm font-bold text-white">{hub}</span>
                <span className="flex items-center gap-4">
                  <span className="hidden sm:flex items-center gap-3 text-xs font-mono text-gray-100">
                    <span>
                      <span className="text-gray-300">DA</span> ${fmtNum(daTot)}
                    </span>
                    <span>
                      <span className="text-gray-300">RT</span> ${fmtNum(rtTot)}
                    </span>
                    <span
                      className={
                        dartTot == null
                          ? "text-gray-300"
                          : dartTot >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                      }
                    >
                      <span className="text-gray-300">DART</span>{" "}
                      {dartTot != null && dartTot >= 0 ? "+" : ""}
                      {fmtNum(dartTot)}
                    </span>
                  </span>
                  <svg
                    className={`h-4 w-4 text-gray-200 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-gray-700">
                  {!hubData ? (
                    <p className="px-4 py-3 text-xs text-gray-200">
                      No data for {date}.
                    </p>
                  ) : (
                    COMPONENTS.map((c, idx) => (
                      <ComponentSection
                        key={c.key}
                        componentKey={c.key}
                        componentLabel={c.label}
                        hubData={hubData}
                        rtOverrides={hubOv[c.key] ?? {}}
                        onOverrideChange={(hour, value) =>
                          handleOverrideChange(hub, c.key, hour, value)
                        }
                        onClearInputs={() => handleClearInputs(hub, c.key)}
                        onSetToDa={() => handleSetToDa(hub, c.key)}
                        weekend={weekend}
                        divider={idx < COMPONENTS.length - 1}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComponentSection({
  componentKey,
  componentLabel,
  hubData,
  rtOverrides,
  onOverrideChange,
  onClearInputs,
  onSetToDa,
  weekend,
  divider,
}: {
  componentKey: ComponentKey;
  componentLabel: string;
  hubData: HubLookup;
  rtOverrides: Record<number, number>;
  onOverrideChange: (hour: number, value: number | null) => void;
  onClearInputs: () => void;
  onSetToDa: () => void;
  weekend: boolean;
  divider: boolean;
}) {
  const tableRows = MARKETS.map((mkt) => {
    const hourly = HOURS.map((h) =>
      resolve(hubData, rtOverrides, mkt, componentKey, h)
    );
    const peakVals: number[] = [];
    const offVals: number[] = [];
    hourly.forEach(({ value }, i) => {
      if (value == null) return;
      const hour = HOURS[i];
      if (!weekend && isPeakHour(hour)) peakVals.push(value);
      else offVals.push(value);
    });
    const allVals = hourly
      .map((h) => h.value)
      .filter((v): v is number => v != null);
    return {
      mkt,
      hourly,
      peak: mean(peakVals),
      off: mean(offVals),
      avg: mean(allVals),
    };
  });

  const chartData = HOURS.map((h) => {
    const point: Record<string, number | string | null> = { he: `HE${h}` };
    for (const mkt of MARKETS) {
      const { value } = resolve(hubData, rtOverrides, mkt, componentKey, h);
      point[MARKET_LABEL[mkt]] = value != null ? Number(value.toFixed(2)) : null;
    }
    return point;
  });

  return (
    <div>
      <div className="space-y-3 px-4 py-4">
        <h4 className="text-sm font-bold uppercase tracking-wider text-white">
          {componentLabel}
        </h4>

        {/* Chart */}
        <ChartCard
          title={`${componentLabel} — Hourly ($/MWh)`}
          height={CHART_HEIGHT}
        >
          {({ chartHeight, hiddenSeries, toggleSeries }) => (
            <>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <ComposedChart
                  data={chartData}
                  margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#283442" />
                  <XAxis
                    dataKey="he"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={abbrevTick}
                    domain={["dataMin - 10", "dataMax + 10"]}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={abbrevTick}
                    domain={["dataMin - 3", "dataMax + 3"]}
                    label={{
                      value: "DART",
                      angle: -90,
                      position: "insideRight",
                      fill: "#6b7280",
                      fontSize: 10,
                      offset: 10,
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#111827",
                      border: "1px solid #374151",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#9ca3af" }}
                    formatter={(value: number, name: string) => [
                      `$${Number(value).toFixed(2)}`,
                      name,
                    ]}
                  />
                  <ReferenceLine
                    yAxisId="right"
                    y={0}
                    stroke="#374151"
                    strokeDasharray="2 2"
                  />
                  {!hiddenSeries.has("DART") && (
                    <Bar
                      yAxisId="right"
                      dataKey="DART"
                      name="DART"
                      isAnimationActive={false}
                      maxBarSize={18}
                    >
                      {chartData.map((entry, i) => (
                        <Cell
                          key={`dart-${i}`}
                          fill={dartBarFill(entry.DART as number | null)}
                        />
                      ))}
                    </Bar>
                  )}
                  {!hiddenSeries.has("DA") && (
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="DA"
                      stroke={MARKET_COLOR.da}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  {!hiddenSeries.has("RT") && (
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="RT"
                      stroke={MARKET_COLOR.rt}
                      strokeWidth={2}
                      dot={(dotProps) => {
                        const {
                          cx,
                          cy,
                          index,
                        } = dotProps as {
                          cx?: number;
                          cy?: number;
                          index?: number;
                        };
                        const hour =
                          index != null ? HOURS[index] : undefined;
                        const isEntered =
                          hour != null &&
                          !hubData.get("rt")?.get(hour) &&
                          rtOverrides[hour] != null;
                        if (
                          !isEntered ||
                          cx == null ||
                          cy == null ||
                          !Number.isFinite(cx) ||
                          !Number.isFinite(cy)
                        ) {
                          return (
                            <circle
                              key={`rt-dot-${index}`}
                              cx={0}
                              cy={0}
                              r={0}
                            />
                          );
                        }
                        return (
                          <circle
                            key={`rt-dot-${index}`}
                            cx={cx}
                            cy={cy}
                            r={4}
                            fill={MARKET_COLOR.rt}
                            stroke="#fbbf24"
                            strokeWidth={1.5}
                          />
                        );
                      }}
                      activeDot={{ r: 4 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]">
                <LegendItem
                  seriesKey="DA"
                  label="DA"
                  color={MARKET_COLOR.da}
                  hiddenSeries={hiddenSeries}
                  toggleSeries={toggleSeries}
                />
                <LegendItem
                  seriesKey="RT"
                  label="RT"
                  color={MARKET_COLOR.rt}
                  hiddenSeries={hiddenSeries}
                  toggleSeries={toggleSeries}
                />
                <LegendItem
                  seriesKey="DART"
                  label="DART (+/−)"
                  color={POS_COLOR}
                  type="square"
                  hiddenSeries={hiddenSeries}
                  toggleSeries={toggleSeries}
                />
              </div>
            </>
          )}
        </ChartCard>

        {/* Table */}
        <div>
          <div className="mb-2 flex items-center justify-end gap-2">
            <button
              onClick={onSetToDa}
              className="rounded border border-sky-500/50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-200 hover:bg-sky-500/10"
            >
              Set RT = DA
            </button>
            <button
              onClick={onClearInputs}
              disabled={Object.keys(rtOverrides).length === 0}
              className="rounded border border-amber-500/50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200 hover:bg-amber-500/10 disabled:opacity-40"
            >
              Clear inputs
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-[#2a3f60]">
            <table className="w-full border-collapse text-[11px] font-mono">
              <thead>
                <tr className="bg-[#16263d]">
                  <th className="sticky left-0 z-10 bg-[#16263d] px-2 py-1.5 text-left text-[#e6efff] font-semibold whitespace-nowrap">
                    Market
                  </th>
                {HOURS.map((h) => (
                  <th
                    key={h}
                    className="px-2 py-1.5 text-right text-[#e6efff] font-semibold whitespace-nowrap"
                  >
                    HE{h}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right text-amber-400 font-semibold whitespace-nowrap">
                  OnPeak
                </th>
                <th className="px-2 py-1.5 text-right text-amber-400 font-semibold whitespace-nowrap">
                  OffPeak
                </th>
                <th className="px-2 py-1.5 text-right text-amber-400 font-semibold whitespace-nowrap">
                  Avg
                </th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => {
                const isDart = r.mkt === "dart";
                const summaryClass = (v: number | null) =>
                  `px-2 py-1 text-right font-semibold whitespace-nowrap ${
                    isDart ? dartColor(v) : "text-[#dbe7ff]"
                  }`;
                return (
                  <tr
                    key={r.mkt}
                    className="border-t border-[#1f334f] hover:bg-[#1c2f4a]"
                  >
                    <td
                      className="sticky left-0 z-10 bg-[#0f1a2b] px-2 py-1 font-bold whitespace-nowrap"
                      style={{ color: MARKET_COLOR[r.mkt] }}
                    >
                      {MARKET_LABEL[r.mkt]}
                    </td>
                    {r.hourly.map(({ value, edited }, i) => {
                      const hour = HOURS[i];
                      const rtActual = hubData.get("rt")?.get(hour);
                      const isEditable = r.mkt === "rt" && !rtActual;
                      const cellColor = isDart
                        ? dartColor(value)
                        : edited
                          ? "italic text-amber-300"
                          : "text-[#dbe7ff]";
                      return (
                        <td
                          key={i}
                          className="px-1 py-1 text-right whitespace-nowrap"
                        >
                          {isEditable ? (
                            <input
                              type="number"
                              step="0.01"
                              value={rtOverrides[hour] ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") {
                                  onOverrideChange(hour, null);
                                  return;
                                }
                                const n = parseFloat(raw);
                                if (Number.isFinite(n)) {
                                  onOverrideChange(hour, n);
                                }
                              }}
                              className="w-14 rounded border border-amber-500/60 bg-[#0f1a2b] px-1 py-0.5 text-right text-[11px] text-amber-200 focus:border-amber-400 focus:outline-none"
                              placeholder="—"
                            />
                          ) : (
                            <span className={cellColor}>{fmtNum(value)}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className={summaryClass(r.peak)}>{fmtNum(r.peak)}</td>
                    <td className={summaryClass(r.off)}>{fmtNum(r.off)}</td>
                    <td className={summaryClass(r.avg)}>{fmtNum(r.avg)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      </div>
      {divider && <div className="mx-4 border-t-2 border-gray-600" />}
    </div>
  );
}
