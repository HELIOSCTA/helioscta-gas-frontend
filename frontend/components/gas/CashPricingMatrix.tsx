"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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

interface MatrixStripColumn {
  promptOffset: number;
  contractCode: string;
  label: string;
}

interface MatrixRow {
  rowKey: string;
  label: string;
  cash: number | null;
  balmo: number | null;
  futures: Array<number | null>;
}

interface MatrixAverages {
  cash: number | null;
  balmo: number | null;
  futures: Array<number | null>;
}

interface MatrixSection {
  key: string;
  title: string;
  rowLabel: "date" | "year";
  rows: MatrixRow[];
  averages: MatrixAverages;
}

interface SourceMetadata {
  canonicalSchemas: string[];
  resolvedSchemas: Record<string, string>;
  resolvedTables: Record<string, string>;
}

interface ApiResponse {
  month: number;
  year: number;
  hub: string;
  hubLabel: string;
  isBasis: boolean;
  strip: MatrixStripColumn[];
  sections: MatrixSection[];
  sourceMetadata: SourceMetadata;
}

interface DifferenceAverages {
  cashToBalmo: number | null;
  cashToFutures: Array<number | null>;
}

function formatDateLabel(value: string): string {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const year = parsed.getUTCFullYear();
  return `${month}/${day}/${year}`;
}

function formatNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }
  return value.toFixed(2);
}

function valueClass(value: number | null): string {
  if (value === null) {
    return "text-gray-500";
  }
  if (value > 0) {
    return "text-emerald-300";
  }
  if (value < 0) {
    return "text-rose-300";
  }
  return "text-gray-300";
}

function computeDifference(cash: number | null, target: number | null): number | null {
  if (cash === null || target === null) {
    return null;
  }
  return cash - target;
}

function computeDifferenceAverages(section: MatrixSection): DifferenceAverages {
  const futuresSum = Array<number>(12).fill(0);
  const futuresCount = Array<number>(12).fill(0);
  let balmoSum = 0;
  let balmoCount = 0;

  for (const row of section.rows) {
    const cash = row.cash;
    if (cash !== null && row.balmo !== null) {
      balmoSum += cash - row.balmo;
      balmoCount += 1;
    }

    for (let offset = 0; offset < 12; offset += 1) {
      const futuresValue = row.futures[offset] ?? null;
      if (cash !== null && futuresValue !== null) {
        futuresSum[offset] += cash - futuresValue;
        futuresCount[offset] += 1;
      }
    }
  }

  return {
    cashToBalmo: balmoCount > 0 ? balmoSum / balmoCount : null,
    cashToFutures: futuresSum.map((sum, offset) =>
      futuresCount[offset] > 0 ? sum / futuresCount[offset] : null
    ),
  };
}

export default function CashPricingMatrix() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [hub, setHub] = useState("hh");
  const [seasonalYears, setSeasonalYears] = useState(5);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [differenceVisibility, setDifferenceVisibility] = useState<Record<string, boolean>>(
    {}
  );
  const cache = useRef<Map<string, ApiResponse>>(new Map());

  const fetchMatrix = useCallback(async (m: number, y: number, h: string, sy: number) => {
    const key = `${m}-${y}-${h}-${sy}`;
    if (cache.current.has(key)) {
      setData(cache.current.get(key) ?? null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/ice-cash-pricing-matrix?month=${m}&year=${y}&hub=${h}&seasonalYears=${sy}`
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const payload = (await res.json()) as ApiResponse;
      cache.current.set(key, payload);
      setData(payload);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatrix(month, year, hub, seasonalYears);
  }, [month, year, hub, seasonalYears, fetchMatrix]);

  const yearOptions = useMemo(() => {
    const options: number[] = [];
    for (let y = currentYear; y >= 2020; y -= 1) {
      options.push(y);
    }
    return options;
  }, [currentYear]);

  const hasRows = (data?.sections ?? []).some((section) => section.rows.length > 0);
  const differenceAveragesBySection = useMemo(() => {
    const entries = (data?.sections ?? []).map((section) => [
      section.key,
      computeDifferenceAverages(section),
    ]);
    return Object.fromEntries(entries) as Record<string, DifferenceAverages>;
  }, [data]);

  const selectClass =
    "rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-[12px] text-gray-200 focus:border-cyan-600 focus:outline-none";

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-gray-800 bg-[#0c0e15] p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Hub</label>
            <select value={hub} onChange={(e) => setHub(e.target.value)} className={selectClass}>
              {HUBS.map((h) => (
                <option key={h.key} value={h.key}>
                  {h.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number.parseInt(e.target.value, 10))}
              className={selectClass}
            >
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number.parseInt(e.target.value, 10))}
              className={selectClass}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Seasonal Years</label>
            <select
              value={seasonalYears}
              onChange={(e) => setSeasonalYears(Number.parseInt(e.target.value, 10))}
              className={selectClass}
            >
              {[3, 4, 5, 6, 7].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading matrix...
            </div>
          )}
        </div>

        {data && (
          <p className="mt-3 text-[11px] text-gray-500">
            Sources: {data.sourceMetadata.canonicalSchemas.join(" + ")} mapped to{" "}
            {Object.entries(data.sourceMetadata.resolvedSchemas)
              .map(([canonical, resolved]) => `${canonical}=${resolved}`)
              .join(", ")}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          Failed to load matrix data: {error}
        </div>
      )}

      {!loading && !error && data && !hasRows && (
        <div className="rounded-lg border border-gray-800 bg-[#0c0e15] px-4 py-10 text-center text-sm text-gray-500">
          No matrix data is available for {data.hubLabel} in {MONTH_NAMES[month - 1]} {year}.
        </div>
      )}

      {!error && data &&
        data.sections.map((section) => {
          if (section.rows.length === 0) {
            return null;
          }

          return (
            <section key={section.key} className="overflow-auto rounded-lg border border-gray-800">
              <div className="flex items-center justify-between border-b border-[#1f3667] bg-[#122855] px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-100">
                  {section.title}
                </p>
                <button
                  onClick={() =>
                    setDifferenceVisibility((prev) => ({
                      ...prev,
                      [section.key]: !prev[section.key],
                    }))
                  }
                  className="rounded border border-cyan-700/50 bg-[#0f1f41] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-200 transition-colors hover:bg-[#16356f]"
                >
                  {differenceVisibility[section.key] ? "Hide Diff" : "Show Diff"}
                </button>
              </div>

              <table className="min-w-full table-fixed text-[12px]">
                <colgroup>
                  <col style={{ width: "10rem" }} />
                  <col style={{ width: "9rem" }} />
                  <col style={{ width: "9rem" }} />
                  {data.strip.map((column) => (
                    <col key={`${section.key}-main-col-${column.promptOffset}`} style={{ width: "6.75rem" }} />
                  ))}
                </colgroup>
                <thead className="bg-[#0f1f41]">
                  <tr className="border-b border-[#1f3667] text-[10px] font-semibold uppercase tracking-wider text-gray-200">
                    <th className="px-2 py-2 text-left">
                      {section.rowLabel === "date" ? "Date" : "Year"}
                    </th>
                    <th className="px-2 py-2 text-right">{data.hubLabel} Cash</th>
                    <th className="px-2 py-2 text-right">{data.hubLabel} Balmo</th>
                    {data.strip.map((column) => (
                      <th key={`${section.key}-${column.promptOffset}`} className="px-2 py-2 text-right">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {section.rows.map((row) => (
                    <tr key={`${section.key}-${row.rowKey}`} className="border-b border-gray-800/60 bg-[#0b1020]">
                      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[12px] text-gray-300">
                        {section.rowLabel === "date" ? formatDateLabel(row.label) : row.label}
                      </td>
                      <td className={`px-2 py-1.5 text-right font-mono ${valueClass(row.cash)}`}>
                        {formatNumber(row.cash)}
                      </td>
                      <td className={`px-2 py-1.5 text-right font-mono ${valueClass(row.balmo)}`}>
                        {formatNumber(row.balmo)}
                      </td>
                      {data.strip.map((column) => {
                        const value = row.futures[column.promptOffset] ?? null;
                        return (
                          <td
                            key={`${section.key}-${row.rowKey}-${column.promptOffset}`}
                            className={`px-2 py-1.5 text-right font-mono ${valueClass(value)}`}
                          >
                            {formatNumber(value)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  <tr className="border-t border-[#1f3667] bg-[#112b61]">
                    <td className="whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-gray-100">
                      Average
                    </td>
                    <td className={`px-2 py-1.5 text-right font-mono font-semibold ${valueClass(section.averages.cash)}`}>
                      {formatNumber(section.averages.cash)}
                    </td>
                    <td className={`px-2 py-1.5 text-right font-mono font-semibold ${valueClass(section.averages.balmo)}`}>
                      {formatNumber(section.averages.balmo)}
                    </td>
                    {data.strip.map((column) => {
                      const value = section.averages.futures[column.promptOffset] ?? null;
                      return (
                        <td
                          key={`${section.key}-avg-${column.promptOffset}`}
                          className={`px-2 py-1.5 text-right font-mono font-semibold ${valueClass(value)}`}
                        >
                          {formatNumber(value)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>

              {differenceVisibility[section.key] && (
                <div className="border-t border-[#1f3667]">
                  <div className="bg-[#0f1f41] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-cyan-200">
                    Difference Table (Cash - Balmo/Futures)
                  </div>
                  <table className="min-w-full table-fixed text-[12px]">
                    <colgroup>
                      <col style={{ width: "10rem" }} />
                      <col style={{ width: "9rem" }} />
                      <col style={{ width: "9rem" }} />
                      {data.strip.map((column) => (
                        <col key={`${section.key}-diff-col-${column.promptOffset}`} style={{ width: "6.75rem" }} />
                      ))}
                    </colgroup>
                    <thead className="bg-[#0d1a36]">
                      <tr className="border-b border-[#1f3667] text-[10px] font-semibold uppercase tracking-wider text-gray-200">
                        <th className="px-2 py-2 text-left">
                          {section.rowLabel === "date" ? "Date" : "Year"}
                        </th>
                        <th className="px-2 py-2 text-right text-gray-500">Cash Ref</th>
                        <th className="px-2 py-2 text-right">Cash-Balmo</th>
                        {data.strip.map((column) => (
                          <th key={`${section.key}-diff-${column.promptOffset}`} className="px-2 py-2 text-right">
                            Cash-{column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {section.rows.map((row) => (
                        <tr
                          key={`${section.key}-diff-row-${row.rowKey}`}
                          className="border-b border-gray-800/60 bg-[#08132a]"
                        >
                          <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[12px] text-gray-300">
                            {section.rowLabel === "date" ? formatDateLabel(row.label) : row.label}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-gray-500">--</td>
                          <td
                            className={`px-2 py-1.5 text-right font-mono ${valueClass(
                              computeDifference(row.cash, row.balmo)
                            )}`}
                          >
                            {formatNumber(computeDifference(row.cash, row.balmo))}
                          </td>
                          {data.strip.map((column) => {
                            const futuresValue = row.futures[column.promptOffset] ?? null;
                            const difference = computeDifference(row.cash, futuresValue);
                            return (
                              <td
                                key={`${section.key}-diff-row-${row.rowKey}-${column.promptOffset}`}
                                className={`px-2 py-1.5 text-right font-mono ${valueClass(difference)}`}
                              >
                                {formatNumber(difference)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}

                      <tr className="border-t border-[#1f3667] bg-[#0f2b57]">
                        <td className="whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-gray-100">
                          Average
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono font-semibold text-gray-500">--</td>
                        <td
                          className={`px-2 py-1.5 text-right font-mono font-semibold ${valueClass(
                            differenceAveragesBySection[section.key]?.cashToBalmo ?? null
                          )}`}
                        >
                          {formatNumber(differenceAveragesBySection[section.key]?.cashToBalmo ?? null)}
                        </td>
                        {data.strip.map((column) => {
                          const value =
                            differenceAveragesBySection[section.key]?.cashToFutures[
                              column.promptOffset
                            ] ?? null;
                          return (
                            <td
                              key={`${section.key}-diff-avg-${column.promptOffset}`}
                              className={`px-2 py-1.5 text-right font-mono font-semibold ${valueClass(value)}`}
                            >
                              {formatNumber(value)}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
    </div>
  );
}
