"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

interface HubMatrixPayload {
  hub: string;
  hubLabel: string;
  isBasis: boolean;
  rows: MatrixRow[];
  strip: MatrixStripColumn[];
  sections: MatrixSection[];
  dailyCashByMonthYear?: Record<string, DailyCashPoint[]>;
}

interface DailyCashPoint {
  date: string;
  cash: number;
  promptContractCode: string | null;
  promptLabel: string | null;
}

interface AllHubsApiResponse {
  scope: "all";
  view?: "summary" | "full";
  month: number;
  year: number;
  seasonalYears: number;
  hubOrder: string[];
  hubs: Record<string, HubMatrixPayload>;
  sourceMetadata: SourceMetadata;
}

interface DifferenceAverages {
  cashToBalmo: number | null;
  cashToFutures: Array<number | null>;
}

interface CurveSeries {
  key: string;
  label: string;
  color: string;
}

interface CurvePoint {
  contract: string;
  [seriesKey: string]: string | number | null;
}

interface TermStripColumn {
  key: string;
  label: string;
  month: number;
}

interface TermStripRow {
  year: number;
  cashValues: Array<number | null>;
  average: number | null;
}

interface TermStripModel {
  columns: TermStripColumn[];
  rows: TermStripRow[];
}

interface HistoricalCellSelection {
  hub: string;
  hubLabel: string;
  year: number;
  month: number;
  monthLabel: string;
  dailyPoints: DailyCashPoint[];
}

const CURVE_COLORS = ["#60a5fa", "#f59e0b", "#34d399", "#f87171", "#a78bfa", "#facc15"];
const CHART_GRID_COLOR = "#2b3342";
const CHART_AXIS_COLOR = "#6b7280";
const CHART_TOOLTIP_BG = "#111827";
const CHART_TOOLTIP_BORDER = "#374151";

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

function computeAverages(rows: MatrixRow[]): MatrixAverages {
  const futuresSum = Array<number>(12).fill(0);
  const futuresCount = Array<number>(12).fill(0);
  let cashSum = 0;
  let cashCount = 0;
  let balmoSum = 0;
  let balmoCount = 0;

  for (const row of rows) {
    if (row.cash !== null) {
      cashSum += row.cash;
      cashCount += 1;
    }
    if (row.balmo !== null) {
      balmoSum += row.balmo;
      balmoCount += 1;
    }

    for (let offset = 0; offset < 12; offset += 1) {
      const value = row.futures[offset] ?? null;
      if (value !== null) {
        futuresSum[offset] += value;
        futuresCount[offset] += 1;
      }
    }
  }

  return {
    cash: cashCount > 0 ? cashSum / cashCount : null,
    balmo: balmoCount > 0 ? balmoSum / balmoCount : null,
    futures: futuresSum.map((sum, offset) =>
      futuresCount[offset] > 0 ? sum / futuresCount[offset] : null
    ),
  };
}

function buildBasisRows(rows: MatrixRow[], henryRowsByKey: Map<string, MatrixRow>): MatrixRow[] {
  return rows.map((row) => {
    const henryRow = henryRowsByKey.get(row.rowKey);
    return {
      ...row,
      cash: computeDifference(row.cash, henryRow?.cash ?? null),
      balmo: computeDifference(row.balmo, henryRow?.balmo ?? null),
      futures: row.futures.map((value, offset) =>
        computeDifference(value ?? null, henryRow?.futures[offset] ?? null)
      ),
    };
  });
}

function toHenryHubBasis(hubData: HubMatrixPayload, henryHubData: HubMatrixPayload): HubMatrixPayload {
  if (hubData.hub === "hh") {
    return hubData;
  }

  const henryRowsByKey = new Map(henryHubData.rows.map((row) => [row.rowKey, row]));
  const rows = buildBasisRows(hubData.rows, henryRowsByKey);
  const henrySectionsByKey = new Map(henryHubData.sections.map((section) => [section.key, section]));

  const sections = hubData.sections.map((section) => {
    const henrySection = henrySectionsByKey.get(section.key);
    if (!henrySection) {
      return section;
    }
    const henrySectionRowsByKey = new Map(henrySection.rows.map((row) => [row.rowKey, row]));
    const basisRows = buildBasisRows(section.rows, henrySectionRowsByKey);
    return {
      ...section,
      rows: basisRows,
      averages: computeAverages(basisRows),
    };
  });

  return {
    ...hubData,
    rows,
    sections,
  };
}

function averageValues(values: Array<number | null>): number | null {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (value !== null) {
      sum += value;
      count += 1;
    }
  }
  return count > 0 ? sum / count : null;
}

function heatCellStyle(value: number | null, min: number, max: number): { backgroundColor?: string } {
  if (value === null || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return {};
  }
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const low = { r: 24, g: 31, b: 44 };
  const high = { r: 58, g: 72, b: 99 };
  const r = Math.round(low.r + (high.r - low.r) * ratio);
  const g = Math.round(low.g + (high.g - low.g) * ratio);
  const b = Math.round(low.b + (high.b - low.b) * ratio);
  const alpha = 0.55;
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`,
  };
}

function parseSeasonalMonth(sectionKey: string): number | null {
  if (!sectionKey.startsWith("seasonal-")) {
    return null;
  }
  const parsed = Number.parseInt(sectionKey.slice("seasonal-".length), 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null;
}

function buildCurrentMonthForwardCurve(
  strip: MatrixStripColumn[],
  rows: MatrixRow[]
): { series: CurveSeries[]; points: CurvePoint[] } {
  const seriesRows = rows.filter((row) => row.futures.some((value) => value !== null));

  const series: CurveSeries[] = seriesRows.map((row, index) => ({
    key: `date-${row.rowKey}`,
    label: formatDateLabel(row.label),
    color: CURVE_COLORS[index % CURVE_COLORS.length],
  }));

  const points: CurvePoint[] = strip.map((column) => {
    const point: CurvePoint = { contract: column.label };
    series.forEach((line, index) => {
      point[line.key] = seriesRows[index]?.futures[column.promptOffset] ?? null;
    });
    return point;
  });

  return { series, points };
}

function buildHistoricalsTermStrip(sections: MatrixSection[]): TermStripModel | null {
  const seasonalSections = sections
    .map((section) => {
      const month = parseSeasonalMonth(section.key);
      return month === null || section.rowLabel !== "year" ? null : { section, month };
    })
    .filter((value): value is { section: MatrixSection; month: number } => value !== null)
    .sort((a, b) => a.month - b.month);

  if (seasonalSections.length === 0) {
    return null;
  }

  const columns: TermStripColumn[] = seasonalSections.map(({ section, month }) => ({
    key: section.key,
    label: MONTH_NAMES[month - 1],
    month,
  }));

  const yearSet = new Set<number>();
  seasonalSections.forEach(({ section }) => {
    section.rows.forEach((row) => {
      const parsedYear = Number.parseInt(row.label, 10);
      if (Number.isFinite(parsedYear)) {
        yearSet.add(parsedYear);
      }
    });
  });

  const years = [...yearSet].sort((a, b) => b - a);
  const rows: TermStripRow[] = years.map((year) => {
    const cashValues = seasonalSections.map(({ section }) => {
      const row = section.rows.find((item) => Number.parseInt(item.label, 10) === year);
      if (!row) {
        return null;
      }
      return row.cash;
    });

    return {
      year,
      cashValues,
      average: averageValues(cashValues),
    };
  });

  return { columns, rows };
}

export default function CashPricingMatrix() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [activeTab, setActiveTab] = useState<"current-month-cash" | "historcials">("current-month-cash");
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [seasonalYears, setSeasonalYears] = useState(5);
  const [currentViewHub, setCurrentViewHub] = useState("hh");
  const [basisToHenryHubByHub, setBasisToHenryHubByHub] = useState<Record<string, boolean>>({});
  const [selectedCurveDatesByHub, setSelectedCurveDatesByHub] = useState<Record<string, string[]>>({});
  const [collapsedHubCards, setCollapsedHubCards] = useState<Record<string, boolean>>({});
  const [collapsedCurrentMonthByHub, setCollapsedCurrentMonthByHub] = useState<Record<string, boolean>>({});
  const [selectedHistoricalCell, setSelectedHistoricalCell] = useState<HistoricalCellSelection | null>(null);

  const [summaryData, setSummaryData] = useState<AllHubsApiResponse | null>(null);
  const [summaryDataKey, setSummaryDataKey] = useState<string | null>(null);
  const [fullData, setFullData] = useState<AllHubsApiResponse | null>(null);
  const [fullDataKey, setFullDataKey] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [fullError, setFullError] = useState<string | null>(null);
  const [differenceVisibility, setDifferenceVisibility] = useState<Record<string, boolean>>(
    {}
  );

  const summaryCache = useRef<Map<string, AllHubsApiResponse>>(new Map());
  const fullCache = useRef<Map<string, AllHubsApiResponse>>(new Map());
  const summaryAbortRef = useRef<AbortController | null>(null);
  const fullAbortRef = useRef<AbortController | null>(null);

  const fetchSummary = useCallback(async (m: number, y: number) => {
    const key = `${m}-${y}`;
    if (summaryCache.current.has(key)) {
      const cached = summaryCache.current.get(key) ?? null;
      setSummaryData(cached);
      setSummaryDataKey(key);
      const firstHub = cached?.hubOrder[0] ?? "hh";
      setCurrentViewHub((prev) => (cached && cached.hubs[prev] ? prev : firstHub));
      return;
    }

    summaryAbortRef.current?.abort();
    const controller = new AbortController();
    summaryAbortRef.current = controller;

    setLoadingSummary(true);
    setSummaryError(null);

    try {
      const res = await fetch(
        `/api/ice-cash-pricing-matrix?scope=all&view=summary&month=${m}&year=${y}`,
        { signal: controller.signal }
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const payload = (await res.json()) as AllHubsApiResponse;
      summaryCache.current.set(key, payload);
      setSummaryData(payload);
      setSummaryDataKey(key);

      const firstHub = payload.hubOrder[0] ?? "hh";
      setCurrentViewHub((prev) => (payload.hubs[prev] ? prev : firstHub));
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setSummaryError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (summaryAbortRef.current === controller) {
        summaryAbortRef.current = null;
        setLoadingSummary(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchSummary(month, year);
  }, [month, year, fetchSummary]);

  const fetchFull = useCallback(async (m: number, y: number, sy: number) => {
    const key = `${m}-${y}-${sy}`;
    if (fullCache.current.has(key)) {
      const cached = fullCache.current.get(key) ?? null;
      setFullData(cached);
      setFullDataKey(key);
      const firstHub = cached?.hubOrder[0] ?? "hh";
      setCurrentViewHub((prev) => (cached && cached.hubs[prev] ? prev : firstHub));
      return;
    }

    fullAbortRef.current?.abort();
    const controller = new AbortController();
    fullAbortRef.current = controller;

    setLoadingFull(true);
    setFullError(null);
    setFullData(null);
    setFullDataKey(null);

    try {
      const res = await fetch(
        `/api/ice-cash-pricing-matrix?scope=all&view=full&month=${m}&year=${y}&seasonalYears=${sy}`,
        { signal: controller.signal }
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const payload = (await res.json()) as AllHubsApiResponse;
      fullCache.current.set(key, payload);
      setFullData(payload);
      setFullDataKey(key);

      const firstHub = payload.hubOrder[0] ?? "hh";
      setCurrentViewHub((prev) => (payload.hubs[prev] ? prev : firstHub));
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setFullError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (fullAbortRef.current === controller) {
        fullAbortRef.current = null;
        setLoadingFull(false);
      }
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "historcials") {
      return;
    }
    fetchFull(month, year, seasonalYears);
  }, [activeTab, month, year, seasonalYears, fetchFull]);

  useEffect(() => {
    return () => {
      summaryAbortRef.current?.abort();
      fullAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "historcials") {
      setSelectedHistoricalCell(null);
    }
  }, [activeTab, currentViewHub, month, year]);

  useEffect(() => {
    if (!selectedHistoricalCell) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedHistoricalCell(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedHistoricalCell]);

  const yearOptions = useMemo(() => {
    const options: number[] = [];
    for (let y = currentYear; y >= 2020; y -= 1) {
      options.push(y);
    }
    return options;
  }, [currentYear]);

  const hubOrder = useMemo(() => {
    if (summaryData?.hubOrder?.length) {
      return summaryData.hubOrder;
    }
    if (fullData?.hubOrder?.length) {
      return fullData.hubOrder;
    }
    return HUBS.map((hub) => hub.key);
  }, [summaryData, fullData]);

  const summaryKey = `${month}-${year}`;
  const fullKey = `${month}-${year}-${seasonalYears}`;
  const currentMonthData = summaryDataKey === summaryKey ? summaryData : null;
  const historcialsData = fullDataKey === fullKey ? fullData : null;
  const historcialsHubData = historcialsData?.hubs[currentViewHub] ?? null;
  const currentMonthHubData = useMemo(
    () =>
      hubOrder
        .map((hubKey) => currentMonthData?.hubs[hubKey] ?? null)
        .filter((hubData): hubData is HubMatrixPayload => hubData !== null),
    [hubOrder, currentMonthData]
  );
  const activeError = activeTab === "current-month-cash" ? summaryError : fullError;
  const activeLoading = activeTab === "current-month-cash" ? loadingSummary : loadingFull;
  const sourceMetadata = summaryData?.sourceMetadata ?? fullData?.sourceMetadata ?? null;
  const displayHubData =
    activeTab === "current-month-cash"
      ? currentMonthHubData
      : historcialsHubData
      ? [historcialsHubData]
      : [];
  const hasRows = displayHubData.some((hubData) => hubData.sections.some((section) => section.rows.length > 0));

  const selectClass =
    "rounded border border-gray-700 bg-[#10141d] px-2 py-1.5 text-[12px] font-semibold text-white focus:border-gray-400 focus:outline-none";

  const tabClass = (active: boolean) =>
    `rounded border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
      active
        ? "border-gray-300/50 bg-[#1a1f2b] text-white"
        : "border-gray-700 bg-[#10141d] text-gray-300 hover:text-white"
    }`;

  const renderHubSections = (
    hubData: HubMatrixPayload,
    showHubBasisToHenryHub: boolean,
    canToggleHubBasisToHenryHub: boolean,
    visibleRowsBySectionKey?: Record<string, MatrixRow[]>,
    sectionFilter?: (section: MatrixSection) => boolean
  ) =>
    hubData.sections
      .filter((section) => (sectionFilter ? sectionFilter(section) : true))
      .map((section) => {
      const sectionRows = visibleRowsBySectionKey?.[section.key] ?? section.rows;
      if (sectionRows.length === 0) {
        return null;
      }

      const displaySection =
        sectionRows === section.rows
          ? section
          : {
              ...section,
              rows: sectionRows,
              averages: computeAverages(sectionRows),
            };
      const diffKey = `${hubData.hub}::${section.key}`;
      const differenceAverages = computeDifferenceAverages(displaySection);
      const cashHeader = showHubBasisToHenryHub
        ? `${hubData.hubLabel} Basis Cash`
        : `${hubData.hubLabel} Cash`;
      const balmoHeader = showHubBasisToHenryHub
        ? `${hubData.hubLabel} Basis Balmo`
        : `${hubData.hubLabel} Balmo`;
      const sectionTitle =
        activeTab === "historcials" && displaySection.key === "current-month"
          ? "Current Month"
          : displaySection.title;

      return (
        <section key={`${hubData.hub}-${section.key}`} className="overflow-auto rounded-lg border border-[#2b313d] bg-[#0d1119]">
          <div className="flex items-center justify-between border-b border-[#2b313d] bg-[#171c27] px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white">{sectionTitle}</p>
            <div className="flex items-center gap-2">
              {canToggleHubBasisToHenryHub && (
                <button
                  onClick={() =>
                    setBasisToHenryHubByHub((prev) => ({
                      ...prev,
                      [hubData.hub]: !prev[hubData.hub],
                    }))
                  }
                  className={`rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    showHubBasisToHenryHub
                      ? "border-gray-500 bg-[#2a3140] text-white hover:bg-[#343c4d]"
                      : "border-gray-600 bg-[#131926] text-white hover:bg-[#202738]"
                  }`}
                >
                  {showHubBasisToHenryHub ? "Show Outright" : "Show Basis"}
                </button>
              )}
              <button
                onClick={() =>
                  setDifferenceVisibility((prev) => ({
                    ...prev,
                    [diffKey]: !prev[diffKey],
                  }))
                }
                className="rounded border border-gray-600 bg-[#131926] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#202738]"
              >
                {differenceVisibility[diffKey] ? "Hide Diff" : "Show Diff"}
              </button>
            </div>
          </div>

          <table className="min-w-full table-fixed text-[12px]">
            <colgroup>
              <col style={{ width: "10rem" }} />
              <col style={{ width: "9rem" }} />
              <col style={{ width: "9rem" }} />
              {hubData.strip.map((column) => (
                <col key={`${hubData.hub}-${section.key}-main-col-${column.promptOffset}`} style={{ width: "6.75rem" }} />
              ))}
            </colgroup>
            <thead className="bg-[#171c27]">
              <tr className="border-b border-[#2b313d] text-[10px] font-bold uppercase tracking-wider text-white">
                <th className="px-2 py-2 text-left">{displaySection.rowLabel === "date" ? "Date" : "Year"}</th>
                <th className="px-2 py-2 text-right">{cashHeader}</th>
                <th className="px-2 py-2 text-right">{balmoHeader}</th>
                {hubData.strip.map((column) => (
                  <th key={`${hubData.hub}-${section.key}-${column.promptOffset}`} className="px-2 py-2 text-right">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {displaySection.rows.map((row) => (
                <tr
                  key={`${hubData.hub}-${section.key}-${row.rowKey}`}
                  className="border-b border-[#1f2531] bg-[#0d1119]"
                >
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[12px] font-semibold text-gray-100">
                    {displaySection.rowLabel === "date" ? formatDateLabel(row.label) : row.label}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono ${valueClass(row.cash)}`}>{formatNumber(row.cash)}</td>
                  <td className={`px-2 py-1.5 text-right font-mono ${valueClass(row.balmo)}`}>{formatNumber(row.balmo)}</td>
                  {hubData.strip.map((column) => {
                    const value = row.futures[column.promptOffset] ?? null;
                    return (
                      <td
                        key={`${hubData.hub}-${section.key}-${row.rowKey}-${column.promptOffset}`}
                        className={`px-2 py-1.5 text-right font-mono ${valueClass(value)}`}
                      >
                        {formatNumber(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}

              <tr className="border-t border-[#2b313d] bg-[#202838]">
                <td className="whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-white">
                  Average
                </td>
                <td
                  className={`px-2 py-1.5 text-right font-mono font-semibold ${valueClass(displaySection.averages.cash)}`}
                >
                  {formatNumber(displaySection.averages.cash)}
                </td>
                <td
                  className={`px-2 py-1.5 text-right font-mono font-semibold ${valueClass(displaySection.averages.balmo)}`}
                >
                  {formatNumber(displaySection.averages.balmo)}
                </td>
                {hubData.strip.map((column) => {
                  const value = displaySection.averages.futures[column.promptOffset] ?? null;
                  return (
                    <td
                      key={`${hubData.hub}-${section.key}-avg-${column.promptOffset}`}
                      className={`px-2 py-1.5 text-right font-mono font-semibold ${valueClass(value)}`}
                    >
                      {formatNumber(value)}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>

          {differenceVisibility[diffKey] && (
            <div className="border-t border-[#2b313d]">
              <div className="bg-[#171c27] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white">
                Difference Table (Cash - Balmo/Futures)
              </div>
              <table className="min-w-full table-fixed text-[12px]">
                <colgroup>
                  <col style={{ width: "10rem" }} />
                  <col style={{ width: "9rem" }} />
                  <col style={{ width: "9rem" }} />
                  {hubData.strip.map((column) => (
                    <col key={`${hubData.hub}-${section.key}-diff-col-${column.promptOffset}`} style={{ width: "6.75rem" }} />
                  ))}
                </colgroup>
                <thead className="bg-[#141924]">
                  <tr className="border-b border-[#2b313d] text-[10px] font-bold uppercase tracking-wider text-white">
                    <th className="px-2 py-2 text-left">{displaySection.rowLabel === "date" ? "Date" : "Year"}</th>
                    <th className="px-2 py-2 text-right text-gray-500">Cash Ref</th>
                    <th className="px-2 py-2 text-right">Cash-Balmo</th>
                    {hubData.strip.map((column) => (
                      <th key={`${hubData.hub}-${section.key}-diff-${column.promptOffset}`} className="px-2 py-2 text-right">
                        Cash-{column.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {displaySection.rows.map((row) => (
                    <tr key={`${hubData.hub}-${section.key}-diff-row-${row.rowKey}`} className="border-b border-[#1f2531] bg-[#0c1018]">
                      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[12px] font-semibold text-gray-100">
                        {displaySection.rowLabel === "date" ? formatDateLabel(row.label) : row.label}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-gray-500">--</td>
                      <td className={`px-2 py-1.5 text-right font-mono ${valueClass(computeDifference(row.cash, row.balmo))}`}>
                        {formatNumber(computeDifference(row.cash, row.balmo))}
                      </td>
                      {hubData.strip.map((column) => {
                        const futuresValue = row.futures[column.promptOffset] ?? null;
                        const difference = computeDifference(row.cash, futuresValue);
                        return (
                          <td
                            key={`${hubData.hub}-${section.key}-diff-row-${row.rowKey}-${column.promptOffset}`}
                            className={`px-2 py-1.5 text-right font-mono ${valueClass(difference)}`}
                          >
                            {formatNumber(difference)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  <tr className="border-t border-[#2b313d] bg-[#202838]">
                    <td className="whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-white">
                      Average
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold text-gray-500">--</td>
                    <td
                      className={`px-2 py-1.5 text-right font-mono font-semibold ${valueClass(
                        differenceAverages.cashToBalmo
                      )}`}
                    >
                      {formatNumber(differenceAverages.cashToBalmo)}
                    </td>
                    {hubData.strip.map((column) => {
                      const value = differenceAverages.cashToFutures[column.promptOffset] ?? null;
                      return (
                        <td
                          key={`${hubData.hub}-${section.key}-diff-avg-${column.promptOffset}`}
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
    });

  const selectedCellDetails = useMemo(() => {
    if (!selectedHistoricalCell) {
      return null;
    }
    const points = [...selectedHistoricalCell.dailyPoints].sort((a, b) => a.date.localeCompare(b.date));
    if (points.length === 0) {
      return {
        ...selectedHistoricalCell,
        points,
        first: null as number | null,
        last: null as number | null,
        min: null as number | null,
        max: null as number | null,
        average: null as number | null,
        promptContractCode: null as string | null,
      };
    }
    const values = points.map((point) => point.cash);
    const first = values[0];
    const last = values[values.length - 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const promptContractCode =
      points.find((point) => point.promptContractCode)?.promptContractCode ?? null;

    return {
      ...selectedHistoricalCell,
      points,
      first,
      last,
      min,
      max,
      average,
      promptContractCode,
    };
  }, [selectedHistoricalCell]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-[#2b313d] bg-[#0a0d13] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={tabClass(activeTab === "current-month-cash")}
            onClick={() => setActiveTab("current-month-cash")}
          >
            Current Month Cash
          </button>
          <button className={tabClass(activeTab === "historcials")} onClick={() => setActiveTab("historcials")}>
            Historcials
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-white">Month</label>
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
            <label className="text-[10px] font-bold uppercase tracking-widest text-white">Year</label>
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

          {activeTab === "historcials" && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-white">Seasonal Years</label>
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
          )}

          {activeLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {activeTab === "current-month-cash"
                ? "Loading all hubs (summary)..."
                : "Loading full seasonal historcials..."}
            </div>
          )}
        </div>

        {activeTab === "historcials" && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {hubOrder.map((hubKey) => {
              const label =
                fullData?.hubs[hubKey]?.hubLabel ??
                summaryData?.hubs[hubKey]?.hubLabel ??
                HUBS.find((h) => h.key === hubKey)?.label ??
                hubKey;
              const isActive = currentViewHub === hubKey;
              return (
                <button
                  key={hubKey}
                  onClick={() => setCurrentViewHub(hubKey)}
                  className={`rounded border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    isActive
                      ? "border-gray-300/50 bg-[#1a1f2b] text-white"
                      : "border-gray-700 bg-[#10141d] text-gray-300 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {sourceMetadata && (
          <p className="mt-3 text-[11px] text-gray-300">
            {activeTab === "current-month-cash"
              ? "Fast mode: default tab loads a current-month summary for all hubs."
              : "Historcials loads full seasonal history for all hubs on demand."}{" "}
            Sources: {sourceMetadata.canonicalSchemas.join(" + ")} mapped to{" "}
            {Object.entries(sourceMetadata.resolvedSchemas)
              .map(([canonical, resolved]) => `${canonical}=${resolved}`)
              .join(", ")}
          </p>
        )}
      </div>

      {activeError && (
        <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          Failed to load matrix data: {activeError}
        </div>
      )}

      {activeTab === "historcials" && loadingFull && !historcialsData && (
        <div className="rounded-lg border border-[#2b313d] bg-[#0a0d13] px-4 py-10 text-center text-sm text-gray-300">
          Loading full seasonal matrix for all hubs...
        </div>
      )}

      {!activeLoading && !activeError && displayHubData.length > 0 && !hasRows && (
        <div className="rounded-lg border border-[#2b313d] bg-[#0a0d13] px-4 py-10 text-center text-sm text-gray-300">
          {activeTab === "current-month-cash"
            ? `No matrix data is available for any hub in ${MONTH_NAMES[month - 1]} ${year}.`
            : `No matrix data is available for ${historcialsHubData?.hubLabel ?? "the selected hub"} in ${
                MONTH_NAMES[month - 1]
              } ${year}.`}
        </div>
      )}

      {!activeError &&
        displayHubData.map((hubData) => {
          const canToggleHubBasisToHenryHub =
            activeTab === "current-month-cash" && hubData.hub !== "hh";
          const showHubBasisToHenryHub =
            canToggleHubBasisToHenryHub && Boolean(basisToHenryHubByHub[hubData.hub]);
          const henryHubData = currentMonthData?.hubs.hh ?? null;
          const effectiveHubData =
            showHubBasisToHenryHub && henryHubData ? toHenryHubBasis(hubData, henryHubData) : hubData;
          const currentMonthSection =
            effectiveHubData.sections.find((section) => section.key === "current-month") ?? null;
          const currentMonthRows = currentMonthSection?.rows ?? [];
          const currentMonthCurve = buildCurrentMonthForwardCurve(effectiveHubData.strip, currentMonthRows);
          const availableCurveDateKeys = currentMonthCurve.series.map((line) => line.key);
          const defaultCurveDateKeys = availableCurveDateKeys.slice(0, Math.min(2, availableCurveDateKeys.length));
          const storedCurveDateKeys = selectedCurveDatesByHub[hubData.hub];
          const filteredStoredCurveDateKeys = (storedCurveDateKeys ?? []).filter((key) =>
            availableCurveDateKeys.includes(key)
          );
          const selectedCurveDateKeys =
            storedCurveDateKeys === undefined
              ? defaultCurveDateKeys
              : filteredStoredCurveDateKeys.length > 0 || storedCurveDateKeys.length === 0
              ? filteredStoredCurveDateKeys
              : defaultCurveDateKeys;
          const visibleCurrentMonthCurveSeries = currentMonthCurve.series.filter((line) =>
            selectedCurveDateKeys.includes(line.key)
          );
          const tableRowOverrides = undefined;

          const sectionFilter =
            activeTab === "historcials"
              ? (section: MatrixSection) => section.key === "current-month"
              : undefined;

          const historicalTermStrip =
            activeTab === "historcials" ? buildHistoricalsTermStrip(effectiveHubData.sections) : null;
          const termStripColumnAverages =
            historicalTermStrip?.columns.map((_, columnIndex) =>
              averageValues(historicalTermStrip.rows.map((row) => row.cashValues[columnIndex]))
            ) ?? [];
          const termStripCalAverage = historicalTermStrip
            ? averageValues(historicalTermStrip.rows.map((row) => row.average))
            : null;
          const dailyCashLookup = effectiveHubData.dailyCashByMonthYear ?? {};
          const hubCardKey = `${activeTab}::${hubData.hub}`;
          const isHubCardCollapsed = Boolean(collapsedHubCards[hubCardKey]);
          const isCurrentMonthCardCollapsed = Boolean(collapsedCurrentMonthByHub[hubData.hub]);

          return (
            <section key={`hub-${hubData.hub}`} className="rounded-xl border border-[#2b313d] bg-[#0a0d13]">
              <div className="flex items-center justify-between gap-2 border-b border-[#2b313d] bg-[#171c27] px-4 py-3">
                <p className="text-[12px] font-bold uppercase tracking-widest text-white">{effectiveHubData.hubLabel}</p>
                <button
                  onClick={() =>
                    setCollapsedHubCards((prev) => ({
                      ...prev,
                      [hubCardKey]: !prev[hubCardKey],
                    }))
                  }
                  className="rounded border border-gray-600 bg-[#10141d] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a1f2b]"
                >
                  {isHubCardCollapsed ? "Expand" : "Collapse"}
                </button>
              </div>

              {!isHubCardCollapsed && <div className="flex flex-col gap-4 p-3 md:p-4">

              {activeTab === "current-month-cash" && (
                <section className="rounded-lg border border-[#2b313d] bg-[#0d1119]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2b313d] bg-[#171c27] px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-white">
                      Forward Curve (All Available Dates)
                    </p>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-300">
                      Select dates from legend
                    </span>
                  </div>

                  {visibleCurrentMonthCurveSeries.length > 0 ? (
                    <div className="h-[260px] w-full p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={currentMonthCurve.points} margin={{ top: 8, right: 16, bottom: 8, left: -8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                          <XAxis dataKey="contract" tick={{ fill: "#d1d5db", fontSize: 11 }} stroke={CHART_AXIS_COLOR} />
                          <YAxis domain={["auto", "auto"]} tick={{ fill: "#d1d5db", fontSize: 11 }} stroke={CHART_AXIS_COLOR} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: CHART_TOOLTIP_BG,
                              border: `1px solid ${CHART_TOOLTIP_BORDER}`,
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                            formatter={(value) => (typeof value === "number" ? value.toFixed(2) : "--")}
                          />
                          {visibleCurrentMonthCurveSeries.map((line) => (
                            <Line
                              key={`${hubData.hub}-${line.key}`}
                              type="monotone"
                              dataKey={line.key}
                              name={line.label}
                              stroke={line.color}
                              strokeWidth={2}
                              dot={false}
                              connectNulls
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="px-3 py-6 text-sm text-gray-500">Not enough futures points to render the curve.</div>
                  )}

                  <div className="border-t border-[#2b313d] px-3 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {currentMonthCurve.series.map((line) => {
                        const isSelected = selectedCurveDateKeys.includes(line.key);
                        return (
                          <button
                            key={`${hubData.hub}-curve-${line.key}`}
                            onClick={() =>
                              setSelectedCurveDatesByHub((prev) => {
                                const current = prev[hubData.hub] ?? defaultCurveDateKeys;
                                const has = current.includes(line.key);
                                const next = has
                                  ? current.filter((entry) => entry !== line.key)
                                  : [...current, line.key];
                                return {
                                  ...prev,
                                  [hubData.hub]: next,
                                };
                              })
                            }
                            className={`rounded border px-2 py-1 text-[10px] font-bold transition-colors ${
                              isSelected
                                ? "border-gray-300/50 bg-[#1a1f2b] text-white"
                                : "border-gray-700 bg-[#10141d] text-gray-300 hover:text-white"
                            }`}
                          >
                            {line.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}

              {activeTab === "current-month-cash" &&
                renderHubSections(
                  effectiveHubData,
                  showHubBasisToHenryHub,
                  canToggleHubBasisToHenryHub,
                  tableRowOverrides,
                  sectionFilter
                )}

              {activeTab === "historcials" && historicalTermStrip && historicalTermStrip.rows.length > 0 && (
                <section className="rounded-xl border border-[#2b313d] bg-[#0d1119]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2b313d] bg-[#171c27] px-4 py-3">
                    <p className="text-[20px] font-bold text-white">Historical Cash Prices</p>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-white">
                      Hub/Location: {effectiveHubData.hubLabel}
                    </p>
                  </div>

                  <div className="overflow-auto px-4 py-4">
                    <table className="min-w-full table-fixed text-[12px]">
                      <colgroup>
                        <col style={{ width: "6rem" }} />
                        {historicalTermStrip.columns.map((column) => (
                          <col key={`${hubData.hub}-term-${column.key}`} style={{ width: "5.5rem" }} />
                        ))}
                        <col style={{ width: "5.5rem" }} />
                      </colgroup>
                      <thead className="bg-[#171c27]">
                        <tr className="border-b border-[#2b313d] text-[10px] font-bold uppercase tracking-wider text-white">
                          <th className="px-2 py-2 text-left">Year</th>
                          {historicalTermStrip.columns.map((column) => (
                            <th key={`${hubData.hub}-${column.key}-hdr`} className="px-2 py-2 text-right">
                              {column.label}
                            </th>
                          ))}
                          <th className="px-2 py-2 text-right">Cal Avg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicalTermStrip.rows.map((row) => {
                          const rowFinite = row.cashValues.filter((value): value is number => value !== null);
                          const rowMin = rowFinite.length > 0 ? Math.min(...rowFinite) : Number.NaN;
                          const rowMax = rowFinite.length > 0 ? Math.max(...rowFinite) : Number.NaN;
                          return (
                            <tr
                              key={`${hubData.hub}-term-row-${row.year}`}
                              className="border-b border-[#1f2531] bg-[#0d1119]"
                            >
                              <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[12px] font-semibold text-gray-100">
                                {row.year}
                              </td>
                              {row.cashValues.map((value, index) => (
                                <td
                                  key={`${hubData.hub}-term-row-${row.year}-${historicalTermStrip.columns[index].key}`}
                                  style={heatCellStyle(value, rowMin, rowMax)}
                                  className="px-2 py-1.5 text-right font-mono text-gray-100"
                                >
                                  <button
                                    onClick={() => {
                                      const column = historicalTermStrip.columns[index];
                                      const monthKey = `${row.year}-${String(column.month).padStart(2, "0")}`;
                                      setSelectedHistoricalCell({
                                        hub: effectiveHubData.hub,
                                        hubLabel: effectiveHubData.hubLabel,
                                        year: row.year,
                                        month: column.month,
                                        monthLabel: column.label,
                                        dailyPoints: dailyCashLookup[monthKey] ?? [],
                                      });
                                    }}
                                    disabled={value === null}
                                    className={`w-full text-right ${
                                      value === null ? "cursor-default text-gray-500" : "hover:text-white"
                                    }`}
                                  >
                                    {formatNumber(value)}
                                  </button>
                                </td>
                              ))}
                              <td
                                style={heatCellStyle(row.average, rowMin, rowMax)}
                                className="px-2 py-1.5 text-right font-mono font-semibold text-gray-100"
                              >
                                {formatNumber(row.average)}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="border-t border-[#2b313d] bg-[#202838]">
                          <td className="whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-white">
                            Average
                          </td>
                          {termStripColumnAverages.map((value, index) => (
                            <td
                              key={`${hubData.hub}-term-avg-${historicalTermStrip.columns[index].key}`}
                              className="px-2 py-1.5 text-right font-mono font-semibold text-gray-100"
                            >
                              {formatNumber(value)}
                            </td>
                          ))}
                          <td className="px-2 py-1.5 text-right font-mono font-semibold text-gray-100">
                            {formatNumber(termStripCalAverage)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between border-t border-[#2b313d] px-4 py-2 text-[10px] text-gray-300">
                    <p>Cal Avg = average of settled months.</p>
                    <div className="flex items-center gap-1">
                      <span>Low</span>
                      <span className="h-2 w-4 rounded-sm bg-[#18202d]" />
                      <span className="h-2 w-4 rounded-sm bg-[#253042]" />
                      <span className="h-2 w-4 rounded-sm bg-[#334259]" />
                      <span className="h-2 w-4 rounded-sm bg-[#3f536f]" />
                      <span>High</span>
                    </div>
                  </div>

                </section>
              )}

              {activeTab === "historcials" && (
                <section className="rounded-xl border border-[#2b313d] bg-[#0d1119]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2b313d] bg-[#171c27] px-4 py-3">
                    <p className="text-[20px] font-bold text-white">Current Month</p>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-white">
                        Hub/Location: {effectiveHubData.hubLabel}
                      </p>
                      <button
                        onClick={() =>
                          setCollapsedCurrentMonthByHub((prev) => ({
                            ...prev,
                            [hubData.hub]: !prev[hubData.hub],
                          }))
                        }
                        className="rounded border border-gray-600 bg-[#10141d] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a1f2b]"
                      >
                        {isCurrentMonthCardCollapsed ? "Expand" : "Collapse"}
                      </button>
                    </div>
                  </div>

                  {!isCurrentMonthCardCollapsed && (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2b313d] bg-[#141924] px-4 py-2">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-white">
                          Forward Curve (All Available Dates)
                        </p>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-300">
                          Select dates from legend
                        </span>
                      </div>

                      {visibleCurrentMonthCurveSeries.length > 0 ? (
                        <div className="h-[260px] w-full p-3">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={currentMonthCurve.points} margin={{ top: 8, right: 16, bottom: 8, left: -8 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                              <XAxis dataKey="contract" tick={{ fill: "#d1d5db", fontSize: 11 }} stroke={CHART_AXIS_COLOR} />
                              <YAxis domain={["auto", "auto"]} tick={{ fill: "#d1d5db", fontSize: 11 }} stroke={CHART_AXIS_COLOR} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: CHART_TOOLTIP_BG,
                                  border: `1px solid ${CHART_TOOLTIP_BORDER}`,
                                  borderRadius: 8,
                                  fontSize: 12,
                                }}
                                formatter={(value) => (typeof value === "number" ? value.toFixed(2) : "--")}
                              />
                              {visibleCurrentMonthCurveSeries.map((line) => (
                                <Line
                                  key={`${hubData.hub}-${line.key}`}
                                  type="monotone"
                                  dataKey={line.key}
                                  name={line.label}
                                  stroke={line.color}
                                  strokeWidth={2}
                                  dot={false}
                                  connectNulls
                                />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="px-4 py-6 text-sm text-gray-500">Not enough futures points to render the curve.</div>
                      )}

                      <div className="border-t border-[#2b313d] px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {currentMonthCurve.series.map((line) => {
                            const isSelected = selectedCurveDateKeys.includes(line.key);
                            return (
                              <button
                                key={`${hubData.hub}-historcials-curve-${line.key}`}
                                onClick={() =>
                                  setSelectedCurveDatesByHub((prev) => {
                                    const current = prev[hubData.hub] ?? defaultCurveDateKeys;
                                    const has = current.includes(line.key);
                                    const next = has
                                      ? current.filter((entry) => entry !== line.key)
                                      : [...current, line.key];
                                    return {
                                      ...prev,
                                      [hubData.hub]: next,
                                    };
                                  })
                                }
                                className={`rounded border px-2 py-1 text-[10px] font-bold transition-colors ${
                                  isSelected
                                    ? "border-gray-300/50 bg-[#1a1f2b] text-white"
                                    : "border-gray-700 bg-[#10141d] text-gray-300 hover:text-white"
                                }`}
                              >
                                {line.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </section>
              )}

              {activeTab === "historcials" &&
                !isCurrentMonthCardCollapsed &&
                renderHubSections(
                  effectiveHubData,
                  showHubBasisToHenryHub,
                  canToggleHubBasisToHenryHub,
                  tableRowOverrides,
                  sectionFilter
                )}
              </div>}
            </section>
          );
        })}

      {selectedCellDetails && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          onClick={() => setSelectedHistoricalCell(null)}
        >
          <div
            className="w-full max-w-6xl rounded-xl border border-[#2b313d] bg-[#121722] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#2b313d] px-6 py-5">
              <div>
                <h3 className="text-[34px] font-bold text-white">
                  {selectedCellDetails.hubLabel} {selectedCellDetails.monthLabel} {selectedCellDetails.year}
                </h3>
                <p className="mt-1 text-sm font-semibold text-gray-300">
                  Contract: {selectedCellDetails.promptContractCode ?? "N/A"}
                </p>
              </div>
              <button
                onClick={() => setSelectedHistoricalCell(null)}
                className="rounded border border-gray-600 bg-[#10141d] px-3 py-1 text-xl font-bold text-white hover:bg-[#1a1f2b]"
              >
                x
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 px-6 py-4 md:grid-cols-5">
              <div className="rounded-lg bg-[#1d2432] px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-300">First</p>
                <p className="text-2xl font-bold text-white">{formatNumber(selectedCellDetails.first)}</p>
              </div>
              <div className="rounded-lg bg-[#1d2432] px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-300">Last</p>
                <p className="text-2xl font-bold text-white">{formatNumber(selectedCellDetails.last)}</p>
              </div>
              <div className="rounded-lg bg-[#1d2432] px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-300">Min</p>
                <p className="text-2xl font-bold text-white">{formatNumber(selectedCellDetails.min)}</p>
              </div>
              <div className="rounded-lg bg-[#1d2432] px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-300">Max</p>
                <p className="text-2xl font-bold text-white">{formatNumber(selectedCellDetails.max)}</p>
              </div>
              <div className="rounded-lg bg-[#1d2432] px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-300">Average</p>
                <p className="text-2xl font-bold text-white">{formatNumber(selectedCellDetails.average)}</p>
              </div>
            </div>

            {selectedCellDetails.points.length > 0 ? (
              <div className="h-[420px] px-6 pb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedCellDetails.points} margin={{ top: 12, right: 18, bottom: 12, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                    <XAxis dataKey="date" tick={{ fill: "#d1d5db", fontSize: 11 }} stroke={CHART_AXIS_COLOR} />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: "#d1d5db", fontSize: 11 }} stroke={CHART_AXIS_COLOR} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: CHART_TOOLTIP_BG,
                        border: `1px solid ${CHART_TOOLTIP_BORDER}`,
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value) => (typeof value === "number" ? value.toFixed(2) : "--")}
                    />
                    <Line type="monotone" dataKey="cash" name="Cash" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="px-6 pb-6 text-sm text-gray-500">No daily cash values are available for this month.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
