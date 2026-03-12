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

interface HubMatrixPayload {
  hub: string;
  hubLabel: string;
  isBasis: boolean;
  rows: MatrixRow[];
  strip: MatrixStripColumn[];
  sections: MatrixSection[];
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

export default function CashPricingMatrix() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [activeTab, setActiveTab] = useState<"current-month-cash" | "historcials">("current-month-cash");
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [seasonalYears, setSeasonalYears] = useState(5);
  const [currentViewHub, setCurrentViewHub] = useState("hh");
  const [basisToHenryHubByHub, setBasisToHenryHubByHub] = useState<Record<string, boolean>>({});

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
    "rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-[12px] text-gray-200 focus:border-cyan-600 focus:outline-none";

  const tabClass = (active: boolean) =>
    `rounded border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
      active
        ? "border-cyan-600/60 bg-cyan-900/30 text-cyan-200"
        : "border-gray-700 bg-[#0f1424] text-gray-400 hover:text-gray-200"
    }`;

  const renderHubSections = (
    hubData: HubMatrixPayload,
    showHubBasisToHenryHub: boolean,
    canToggleHubBasisToHenryHub: boolean
  ) =>
    hubData.sections.map((section) => {
      if (section.rows.length === 0) {
        return null;
      }

      const diffKey = `${hubData.hub}::${section.key}`;
      const differenceAverages = computeDifferenceAverages(section);
      const cashHeader = showHubBasisToHenryHub
        ? `${hubData.hubLabel} Basis Cash`
        : `${hubData.hubLabel} Cash`;
      const balmoHeader = showHubBasisToHenryHub
        ? `${hubData.hubLabel} Basis Balmo`
        : `${hubData.hubLabel} Balmo`;

      return (
        <section key={`${hubData.hub}-${section.key}`} className="overflow-auto rounded-lg border border-gray-800">
          <div className="flex items-center justify-between border-b border-[#1f3667] bg-[#122855] px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-100">{section.title}</p>
            <div className="flex items-center gap-2">
              {canToggleHubBasisToHenryHub && (
                <button
                  onClick={() =>
                    setBasisToHenryHubByHub((prev) => ({
                      ...prev,
                      [hubData.hub]: !prev[hubData.hub],
                    }))
                  }
                  className={`rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                    showHubBasisToHenryHub
                      ? "border-cyan-700/50 bg-[#123264] text-cyan-200 hover:bg-[#18407f]"
                      : "border-cyan-700/50 bg-[#0f1f41] text-cyan-200 hover:bg-[#16356f]"
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
                className="rounded border border-cyan-700/50 bg-[#0f1f41] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-200 transition-colors hover:bg-[#16356f]"
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
            <thead className="bg-[#0f1f41]">
              <tr className="border-b border-[#1f3667] text-[10px] font-semibold uppercase tracking-wider text-gray-200">
                <th className="px-2 py-2 text-left">{section.rowLabel === "date" ? "Date" : "Year"}</th>
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
              {section.rows.map((row) => (
                <tr key={`${hubData.hub}-${section.key}-${row.rowKey}`} className="border-b border-gray-800/60 bg-[#0b1020]">
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[12px] text-gray-300">
                    {section.rowLabel === "date" ? formatDateLabel(row.label) : row.label}
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
                {hubData.strip.map((column) => {
                  const value = section.averages.futures[column.promptOffset] ?? null;
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
            <div className="border-t border-[#1f3667]">
              <div className="bg-[#0f1f41] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-cyan-200">
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
                <thead className="bg-[#0d1a36]">
                  <tr className="border-b border-[#1f3667] text-[10px] font-semibold uppercase tracking-wider text-gray-200">
                    <th className="px-2 py-2 text-left">{section.rowLabel === "date" ? "Date" : "Year"}</th>
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
                  {section.rows.map((row) => (
                    <tr
                      key={`${hubData.hub}-${section.key}-diff-row-${row.rowKey}`}
                      className="border-b border-gray-800/60 bg-[#08132a]"
                    >
                      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[12px] text-gray-300">
                        {section.rowLabel === "date" ? formatDateLabel(row.label) : row.label}
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

                  <tr className="border-t border-[#1f3667] bg-[#0f2b57]">
                    <td className="whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-gray-100">
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

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-gray-800 bg-[#0c0e15] p-4">
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

          {activeTab === "historcials" && (
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
                      ? "border-cyan-600/60 bg-cyan-900/25 text-cyan-200"
                      : "border-gray-700 bg-[#0f1424] text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {sourceMetadata && (
          <p className="mt-3 text-[11px] text-gray-500">
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
        <div className="rounded-lg border border-gray-800 bg-[#0c0e15] px-4 py-10 text-center text-sm text-gray-500">
          Loading full seasonal matrix for all hubs...
        </div>
      )}

      {!activeLoading && !activeError && displayHubData.length > 0 && !hasRows && (
        <div className="rounded-lg border border-gray-800 bg-[#0c0e15] px-4 py-10 text-center text-sm text-gray-500">
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

          return (
            <div key={`hub-${hubData.hub}`} className="flex flex-col gap-4">
              {renderHubSections(
                effectiveHubData,
                showHubBasisToHenryHub,
                canToggleHubBasisToHenryHub
              )}
            </div>
          );
        })}
    </div>
  );
}
