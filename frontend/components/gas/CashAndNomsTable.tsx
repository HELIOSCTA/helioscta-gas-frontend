"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { Watchlist } from "@/lib/watchlists";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

interface NomRow {
  gas_day: string;
  pipeline_short_name: string;
  loc_name: string;
  location_role_id: number;
  scheduled_cap: number;
  signed_scheduled_cap: number;
  operational_cap: number;
  available_cap: number;
  design_cap: number;
}

interface HubDef {
  key: string;
  label: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_LOOKBACK = 60;

const HUBS: HubDef[] = [
  { key: "hh", label: "Henry Hub" },
  { key: "transco_st85", label: "St 85" },
  { key: "pine_prarie", label: "Pine Prairie" },
  { key: "houston_ship_channel", label: "HSC" },
  { key: "waha", label: "Waha" },
  { key: "ngpl_txok", label: "NGPL TX/OK" },
  { key: "transco_zone_5_south", label: "Transco Z5S" },
  { key: "tetco_m3", label: "Tetco M3" },
  { key: "agt", label: "AGT" },
  { key: "iroquois_z2", label: "Iroquois Z2" },
  { key: "socal_cg", label: "Socal CG" },
  { key: "pge_cg", label: "PGE CG" },
  { key: "cig", label: "CIG" },
];

const PRODUCTS = ["Cash", "Balmo"] as const;
type Product = (typeof PRODUCTS)[number];

const NOM_METRICS = [
  { key: "scheduled_cap" as keyof NomRow, label: "Scheduled" },
  { key: "signed_scheduled_cap" as keyof NomRow, label: "Signed Scheduled" },
  { key: "operational_cap" as keyof NomRow, label: "Oper Cap" },
  { key: "available_cap" as keyof NomRow, label: "Avail Cap" },
  { key: "design_cap" as keyof NomRow, label: "Design Cap" },
] as const;

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

function fmtNum(val: number | null | undefined): string {
  if (val == null) return "--";
  return Number(val).toLocaleString();
}

function fmtPivotDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getWeekFriday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day <= 5 ? 5 - day : 6;
  const fri = new Date(d);
  fri.setDate(fri.getDate() + diff);
  return fri.toISOString().slice(0, 10);
}

function heatBg(value: number, min: number, max: number): string {
  if (max === min) return "transparent";
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (ratio >= 0.5) {
    const intensity = (ratio - 0.5) * 2;
    return `rgba(34, 197, 94, ${(0.15 + intensity * 0.55).toFixed(2)})`;
  }
  const intensity = (0.5 - ratio) * 2;
  return `rgba(239, 68, 68, ${(0.15 + intensity * 0.55).toFixed(2)})`;
}

function spreadBgStyle(v: number | null): React.CSSProperties {
  if (v === null) return {};
  const abs = Math.abs(v);
  const t = Math.min(abs / 0.5, 1);
  if (v > 0) return { backgroundColor: `rgba(34, 197, 94, ${0.15 + t * 0.4})` };
  if (v < 0) return { backgroundColor: `rgba(239, 68, 68, ${0.15 + t * 0.4})` };
  return { backgroundColor: "rgba(34, 197, 94, 0.1)" };
}

function buildWeekGroups(dates: string[]): { label: string; span: number }[] {
  const weekGroups: { label: string; span: number }[] = [];
  let currentFri = "";
  for (const d of dates) {
    const fri = getWeekFriday(d);
    if (fri !== currentFri) {
      weekGroups.push({ label: fmtPivotDate(fri), span: 1 });
      currentFri = fri;
    } else {
      weekGroups[weekGroups.length - 1].span += 1;
    }
  }
  return weekGroups;
}

function downloadPivotCsv(
  filename: string,
  dates: string[],
  leftHeaders: string[],
  rows: { leftCols: string[]; vals: (number | null)[] }[]
) {
  const header = [...leftHeaders, ...dates.map(fmtPivotDate)].join(",");
  const csvRows = rows.map((r) => {
    const left = r.leftCols.map((c) => {
      if (c.includes(",") || c.includes('"')) return `"${c.replace(/"/g, '""')}"`;
      return c;
    });
    const vals = r.vals.map((v) => (v !== null ? String(v) : ""));
    return [...left, ...vals].join(",");
  });
  const csv = [header, ...csvRows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  MultiSelect                                                        */
/* ------------------------------------------------------------------ */

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "Select...",
  width = "w-64",
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter((o) => o.toLowerCase().includes(filter.toLowerCase()));

  const toggle = (option: string) => {
    if (selected.includes(option)) onChange(selected.filter((s) => s !== option));
    else onChange([...selected, option]);
  };

  const buttonText =
    selected.length === 0
      ? placeholder
      : selected.length <= 2
        ? selected.join(", ")
        : `${selected.length} selected`;

  return (
    <div className="relative flex flex-col gap-1" ref={ref}>
      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</label>
      <button
        onClick={() => setOpen(!open)}
        className={`${width} rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-left text-gray-200 focus:border-gray-500 focus:outline-none truncate`}
      >
        {selected.length === 0 ? <span className="text-gray-600">{placeholder}</span> : buttonText}
      </button>
      {open && (
        <div className={`absolute top-full left-0 z-50 mt-1 ${width} rounded-md border border-gray-700 bg-[#12141d] shadow-xl`}>
          <div className="sticky top-0 bg-[#12141d] p-2 border-b border-gray-700">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search..."
              className="w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none"
              autoFocus
            />
          </div>
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 text-left border-b border-gray-700"
            >
              Clear all ({selected.length})
            </button>
          )}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-600">No matches</div>
            ) : (
              filtered.map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => toggle(option)}
                    className="rounded accent-blue-500"
                  />
                  <span className="truncate">{option}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface CashAndNomsTableProps {
  watchlists: Watchlist[];
  watchlistsLoading: boolean;
}

export default function CashAndNomsTable({ watchlists, watchlistsLoading }: CashAndNomsTableProps) {
  /* --- filter state --- */
  const [selectedWatchlist, setSelectedWatchlist] = useState<string>("");
  const [lookbackDays, setLookbackDays] = useState(DEFAULT_LOOKBACK);
  const [startDate, setStartDate] = useState(() => lookbackDate(DEFAULT_LOOKBACK));
  const [endDate, setEndDate] = useState(() => todayStr());
  const [selectedHubs, setSelectedHubs] = useState<string[]>(["Henry Hub"]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([...PRODUCTS]);

  /* --- data state --- */
  const [cashRows, setCashRows] = useState<Row[]>([]);
  const [nomRows, setNomRows] = useState<NomRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  /* --- table controls --- */
  const [cashOpen, setCashOpen] = useState(true);
  const [cashDisplay, setCashDisplay] = useState<"values" | "dod">("values");

  const [nomsOpen, setNomsOpen] = useState(true);
  const [nomMetric, setNomMetric] = useState<keyof NomRow>("scheduled_cap");
  const [nomDisplay, setNomDisplay] = useState<"values" | "dod">("values");

  /* --- derived hub list (filtered by multi-select) --- */
  const activeHubs = useMemo(
    () => HUBS.filter((h) => selectedHubs.includes(h.label)),
    [selectedHubs]
  );

  /* --- lookback handler --- */
  const handleLookbackChange = useCallback((days: number) => {
    setLookbackDays(days);
    setEndDate(todayStr());
    setStartDate(lookbackDate(days));
  }, []);

  /* --- auto-select first watchlist --- */
  if (!selectedWatchlist && watchlists.length > 0) {
    setSelectedWatchlist(watchlists[0].id);
  }

  /* --- load data --- */
  const handleLoad = useCallback(async () => {
    const wl = watchlists.find((w) => w.id === selectedWatchlist);
    if (!wl) return;

    setLoading(true);
    setError(null);
    setHasLoaded(true);

    try {
      const [cashRes, nomsRes] = await Promise.all([
        fetch(`/api/ice-cash-daily?startDate=${startDate}&endDate=${endDate}`),
        fetch(
          `/api/genscape-noms?start=${startDate}&end=${endDate}&locationRoleId=${wl.locationRoleIds.join(",")}&limit=5000`
        ),
      ]);

      if (!cashRes.ok) throw new Error(`Cash API: HTTP ${cashRes.status}`);
      if (!nomsRes.ok) throw new Error(`Noms API: HTTP ${nomsRes.status}`);

      const [cashData, nomsData] = await Promise.all([cashRes.json(), nomsRes.json()]);

      setCashRows(cashData.rows ?? []);
      setNomRows(nomsData.rows ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [watchlists, selectedWatchlist, startDate, endDate]);

  /* --- which product suffixes are active --- */
  const activeProductSuffixes = useMemo(() => {
    const list: { label: string; suffix: string; isSpread: boolean }[] = [];
    if (selectedProducts.includes("Cash")) list.push({ label: "Cash", suffix: "_cash", isSpread: false });
    if (selectedProducts.includes("Balmo")) list.push({ label: "Balmo", suffix: "_balmo", isSpread: false });
    if (selectedProducts.includes("Cash") && selectedProducts.includes("Balmo"))
      list.push({ label: "Cash-Balmo", suffix: "_cash_balmo", isSpread: true });
    return list;
  }, [selectedProducts]);

  /* --- Pivot cash data: rows = hub × product, columns = dates --- */
  const cashPivot = useMemo(() => {
    if (cashRows.length === 0)
      return {
        dates: [] as string[],
        weekGroups: [] as { label: string; span: number }[],
        rows: [] as { hub: string; hubLabel: string; product: string; isSpread: boolean; byDate: Map<string, number | null> }[],
      };

    const dateSet = new Set<string>();
    for (const row of cashRows) {
      const d = (row.gas_day as string)?.slice(0, 10);
      if (d) dateSet.add(d);
    }
    const dates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));
    const weekGroups = buildWeekGroups(dates);

    const pivotRows: { hub: string; hubLabel: string; product: string; isSpread: boolean; byDate: Map<string, number | null> }[] = [];
    for (const hub of activeHubs) {
      for (const prod of activeProductSuffixes) {
        const byDate = new Map<string, number | null>();
        for (const row of cashRows) {
          const d = (row.gas_day as string)?.slice(0, 10);
          if (d) byDate.set(d, getNum(row, hub.key + prod.suffix));
        }
        pivotRows.push({ hub: hub.key, hubLabel: hub.label, product: prod.label, isSpread: prod.isSpread, byDate });
      }
    }

    return { dates, weekGroups, rows: pivotRows };
  }, [cashRows, activeHubs, activeProductSuffixes]);

  /* --- Pivot noms data: rows = pipeline × location, columns = dates --- */
  const nomsPivot = useMemo(() => {
    if (nomRows.length === 0)
      return {
        dates: [] as string[],
        weekGroups: [] as { label: string; span: number }[],
        rows: [] as { pipeline: string; locName: string; locationRoleId: number; byDate: Map<string, number> }[],
      };

    const dateSet = new Set<string>();
    const groups = new Map<
      string,
      { pipeline: string; locName: string; locationRoleId: number; byDate: Map<string, number> }
    >();

    for (const row of nomRows) {
      const day = row.gas_day?.slice(0, 10);
      if (!day) continue;
      dateSet.add(day);

      const key = `${row.pipeline_short_name}|${row.loc_name}|${row.location_role_id}`;
      let group = groups.get(key);
      if (!group) {
        group = { pipeline: row.pipeline_short_name, locName: row.loc_name, locationRoleId: row.location_role_id, byDate: new Map() };
        groups.set(key, group);
      }
      const val = (row[nomMetric] as number) ?? 0;
      const existing = group.byDate.get(day) ?? 0;
      group.byDate.set(day, existing + val);
    }

    const dates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));
    const weekGroups = buildWeekGroups(dates);
    const pivotRows = Array.from(groups.values()).sort(
      (a, b) => a.pipeline.localeCompare(b.pipeline) || a.locName.localeCompare(b.locName)
    );

    return { dates, weekGroups, rows: pivotRows };
  }, [nomRows, nomMetric]);

  /* --- CSV helpers --- */
  const handleCashCsv = useCallback(() => {
    const csvRows = cashPivot.rows.map((pr) => ({
      leftCols: [pr.hubLabel, pr.product],
      vals: cashPivot.dates.map((d) => pr.byDate.get(d) ?? null),
    }));
    downloadPivotCsv("cash_prices", cashPivot.dates, ["Hub", "Product"], csvRows);
  }, [cashPivot]);

  const handleNomsCsv = useCallback(() => {
    const csvRows = nomsPivot.rows.map((pr) => ({
      leftCols: [pr.pipeline, pr.locName, String(pr.locationRoleId)],
      vals: nomsPivot.dates.map((d) => pr.byDate.get(d) ?? null),
    }));
    downloadPivotCsv(`noms_${String(nomMetric)}`, nomsPivot.dates, ["Pipeline", "Location", "Role ID"], csvRows);
  }, [nomsPivot, nomMetric]);

  /* --- pill button class helper --- */
  const pill = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs transition-colors ${
      active ? "bg-gray-700 text-white" : "border border-gray-800 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
    }`;

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="space-y-5">
      {/* -------- Date Range -------- */}
      <div className="rounded-lg border border-gray-800 bg-[#12141d] p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">Date Range</p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Lookback Days</label>
            <input
              type="number"
              min={1}
              max={365}
              value={lookbackDays}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v) && v > 0) handleLookbackChange(v);
              }}
              className="w-24 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* -------- Filters -------- */}
      <div className="rounded-lg border border-gray-800 bg-[#12141d] p-4 space-y-4">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">Filters</p>
        <div className="flex flex-wrap items-end gap-4">
          {/* Watchlist */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Watchlist</label>
            {watchlistsLoading ? (
              <span className="text-xs text-gray-600">Loading...</span>
            ) : (
              <select
                value={selectedWatchlist}
                onChange={(e) => setSelectedWatchlist(e.target.value)}
                className="w-64 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              >
                {watchlists.map((wl) => (
                  <option key={wl.id} value={wl.id}>
                    {wl.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Hub multi-select */}
          <MultiSelect
            label="Hubs"
            options={HUBS.map((h) => h.label)}
            selected={selectedHubs}
            onChange={setSelectedHubs}
            placeholder="All hubs..."
            width="w-64"
          />

          {/* Product multi-select */}
          <MultiSelect
            label="Products"
            options={[...PRODUCTS]}
            selected={selectedProducts}
            onChange={setSelectedProducts}
            placeholder="Select products..."
            width="w-48"
          />

          {/* Load */}
          <button
            onClick={handleLoad}
            disabled={loading || !selectedWatchlist}
            className="rounded-md bg-cyan-700 px-5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Load"}
          </button>
        </div>
      </div>

      {/* -------- Pre-load prompt -------- */}
      {!hasLoaded && !loading && (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-gray-600">
            Select filters above and click <span className="font-semibold text-gray-400">Load</span> to view data.
          </p>
        </div>
      )}

      {/* -------- Loading / Error -------- */}
      {loading && (
        <div className="flex items-center justify-center h-48">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading cash prices &amp; nominations...
          </div>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          Failed to load data: {error}
        </div>
      )}

      {/* ================================================================ */}
      {/*  Cash Prices Pivot                                                */}
      {/* ================================================================ */}
      {hasLoaded && !loading && !error && (
        <>
          <div className="rounded-xl border border-gray-800 bg-[#12141d]">
            {/* Header */}
            <button
              onClick={() => setCashOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-300">Cash Prices</span>
                <span className="text-xs text-gray-500">
                  {cashPivot.rows.length} row{cashPivot.rows.length !== 1 ? "s" : ""} &times; {cashPivot.dates.length} day{cashPivot.dates.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {cashPivot.rows.length > 0 && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); handleCashCsv(); }}
                    className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-700"
                  >
                    Download CSV
                  </span>
                )}
                <span className="text-gray-500 text-sm">{cashOpen ? "v" : ">"}</span>
              </div>
            </button>

            {cashOpen && (
              <div className="border-t border-gray-800">
                {/* Display selector */}
                <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Display</span>
                  <div className="flex gap-1.5">
                    {([["values", "Daily Values"], ["dod", "DoD Changes"]] as const).map(([key, label]) => (
                      <button key={key} onClick={() => setCashDisplay(key)} className={pill(cashDisplay === key)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  {cashPivot.dates.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-gray-600">No cash price data for this date range.</div>
                  ) : (
                    <table className="w-full text-xs border-collapse" style={{ minWidth: `${210 + cashPivot.dates.length * 80}px` }}>
                      <thead>
                        {/* Week group row */}
                        <tr>
                          <th colSpan={2} className="sticky left-0 z-20 bg-[#12141d] border-b border-r border-gray-700" />
                          {cashPivot.weekGroups.map((wg, i) => (
                            <th key={i} colSpan={wg.span} className="px-1 py-1.5 text-center text-[10px] font-bold text-gray-400 border-b border-gray-700 whitespace-nowrap">
                              {wg.label}
                            </th>
                          ))}
                        </tr>
                        {/* Date header row */}
                        <tr>
                          <th className="sticky left-0 z-20 bg-[#12141d] px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 border-b border-r border-gray-700 whitespace-nowrap" style={{ minWidth: 120 }}>
                            Hub
                          </th>
                          <th className="sticky left-[120px] z-20 bg-[#12141d] px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 border-b border-r border-gray-700 whitespace-nowrap" style={{ minWidth: 90 }}>
                            Product
                          </th>
                          {cashPivot.dates.map((d) => (
                            <th key={d} className="px-1 py-1.5 text-right text-[10px] font-medium text-gray-500 border-b border-gray-700 whitespace-nowrap">
                              {fmtPivotDate(d)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cashPivot.rows.map((pr) => {
                          const vals = cashPivot.dates.map((d) => pr.byDate.get(d) ?? null);

                          if (cashDisplay === "values") {
                            return (
                              <tr key={`${pr.hub}-${pr.product}`} className="hover:bg-gray-800/30">
                                <td className="sticky left-0 z-10 bg-[#12141d] px-2 py-1 text-gray-300 border-r border-gray-800 whitespace-nowrap text-xs">
                                  {pr.hubLabel}
                                </td>
                                <td className="sticky left-[120px] z-10 bg-[#12141d] px-2 py-1 text-gray-400 border-r border-gray-800 whitespace-nowrap text-xs">
                                  {pr.product}
                                </td>
                                {vals.map((v, i) => (
                                  <td
                                    key={cashPivot.dates[i]}
                                    className="px-1 py-1 text-right whitespace-nowrap font-mono border-r border-gray-800/30"
                                    style={pr.isSpread ? spreadBgStyle(v) : {}}
                                  >
                                    <span className={pr.isSpread ? "text-gray-100" : "text-gray-300"}>
                                      {fmtPrice(v)}
                                    </span>
                                  </td>
                                ))}
                              </tr>
                            );
                          }

                          // DoD mode
                          const dods = vals.map((v, i) =>
                            i < vals.length - 1 && v !== null && vals[i + 1] !== null ? v - vals[i + 1]! : null
                          );
                          const dodVals = dods.filter((v): v is number => v !== null);
                          const dodMin = dodVals.length > 0 ? Math.min(...dodVals) : 0;
                          const dodMax = dodVals.length > 0 ? Math.max(...dodVals) : 0;
                          return (
                            <tr key={`${pr.hub}-${pr.product}`} className="hover:bg-gray-800/30">
                              <td className="sticky left-0 z-10 bg-[#12141d] px-2 py-1 text-gray-300 border-r border-gray-800 whitespace-nowrap text-xs">
                                {pr.hubLabel}
                              </td>
                              <td className="sticky left-[120px] z-10 bg-[#12141d] px-2 py-1 text-gray-400 border-r border-gray-800 whitespace-nowrap text-xs">
                                {pr.product}
                              </td>
                              {dods.map((d, i) => (
                                <td
                                  key={cashPivot.dates[i]}
                                  className="px-1 py-1 text-right whitespace-nowrap font-mono border-r border-gray-800/30"
                                  style={{ backgroundColor: d !== null ? heatBg(d, dodMin, dodMax) : "transparent" }}
                                >
                                  <span className={d !== null ? (d > 0 ? "text-green-400" : d < 0 ? "text-red-400" : "text-gray-500") : "text-gray-600"}>
                                    {d !== null ? (d > 0 ? "+" : "") + fmtPrice(d) : "—"}
                                  </span>
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ================================================================ */}
          {/*  Nominations Pivot                                                */}
          {/* ================================================================ */}
          <div className="rounded-xl border border-gray-800 bg-[#12141d]">
            {/* Header */}
            <button
              onClick={() => setNomsOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-300">Nominations</span>
                <span className="text-xs text-gray-500">
                  {nomsPivot.rows.length} location{nomsPivot.rows.length !== 1 ? "s" : ""} &times; {nomsPivot.dates.length} day{nomsPivot.dates.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {nomsPivot.rows.length > 0 && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); handleNomsCsv(); }}
                    className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-700"
                  >
                    Download CSV
                  </span>
                )}
                <span className="text-gray-500 text-sm">{nomsOpen ? "v" : ">"}</span>
              </div>
            </button>

            {nomsOpen && (
              <div className="border-t border-gray-800">
                {/* Metric selector */}
                <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Metric</span>
                  <div className="flex flex-wrap gap-1.5">
                    {NOM_METRICS.map((m) => (
                      <button key={m.key} onClick={() => setNomMetric(m.key)} className={pill(nomMetric === m.key)}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Display selector */}
                <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Display</span>
                  <div className="flex gap-1.5">
                    {([["values", "Daily Values"], ["dod", "DoD Changes"]] as const).map(([key, label]) => (
                      <button key={key} onClick={() => setNomDisplay(key)} className={pill(nomDisplay === key)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  {nomsPivot.dates.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-gray-600">No nomination data for this watchlist and date range.</div>
                  ) : (
                    <table className="w-full text-xs border-collapse" style={{ minWidth: `${300 + nomsPivot.dates.length * 88}px` }}>
                      <thead>
                        {/* Week group row */}
                        <tr>
                          <th colSpan={2} className="sticky left-0 z-20 bg-[#12141d] border-b border-r border-gray-700" />
                          {nomsPivot.weekGroups.map((wg, i) => (
                            <th key={i} colSpan={wg.span} className="px-1 py-1.5 text-center text-[10px] font-bold text-gray-400 border-b border-gray-700 whitespace-nowrap">
                              {wg.label}
                            </th>
                          ))}
                        </tr>
                        {/* Date header row */}
                        <tr>
                          <th className="sticky left-0 z-20 bg-[#12141d] px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 border-b border-r border-gray-700 whitespace-nowrap" style={{ minWidth: 100 }}>
                            Pipeline
                          </th>
                          <th className="sticky left-[100px] z-20 bg-[#12141d] px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 border-b border-r border-gray-700 whitespace-nowrap" style={{ minWidth: 180 }}>
                            Location
                          </th>
                          {nomsPivot.dates.map((d) => (
                            <th key={d} className="px-1 py-1.5 text-right text-[10px] font-medium text-gray-500 border-b border-gray-700 whitespace-nowrap">
                              {fmtPivotDate(d)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {nomsPivot.rows.map((pr) => {
                          const vals = nomsPivot.dates.map((d) => pr.byDate.get(d) ?? 0);

                          if (nomDisplay === "values") {
                            const rowMin = Math.min(...vals);
                            const rowMax = Math.max(...vals);
                            return (
                              <tr key={`${pr.pipeline}-${pr.locationRoleId}`} className="hover:bg-gray-800/30">
                                <td className="sticky left-0 z-10 bg-[#12141d] px-2 py-1 text-gray-300 border-r border-gray-800 whitespace-nowrap">{pr.pipeline}</td>
                                <td className="sticky left-[100px] z-10 bg-[#12141d] px-2 py-1 text-gray-300 border-r border-gray-800 whitespace-nowrap truncate max-w-[180px]" title={pr.locName}>{pr.locName}</td>
                                {vals.map((v, i) => (
                                  <td
                                    key={nomsPivot.dates[i]}
                                    className="px-1 py-1 text-right text-gray-200 whitespace-nowrap font-mono border-r border-gray-800/30"
                                    style={{ backgroundColor: heatBg(v, rowMin, rowMax) }}
                                  >
                                    {fmtNum(v)}
                                  </td>
                                ))}
                              </tr>
                            );
                          }

                          // DoD mode
                          const dods = vals.map((v, i) =>
                            i < vals.length - 1 ? v - vals[i + 1] : null
                          );
                          const dodVals = dods.filter((v): v is number => v !== null);
                          const dodMin = dodVals.length > 0 ? Math.min(...dodVals) : 0;
                          const dodMax = dodVals.length > 0 ? Math.max(...dodVals) : 0;
                          return (
                            <tr key={`${pr.pipeline}-${pr.locationRoleId}`} className="hover:bg-gray-800/30">
                              <td className="sticky left-0 z-10 bg-[#12141d] px-2 py-1 text-gray-300 border-r border-gray-800 whitespace-nowrap">{pr.pipeline}</td>
                              <td className="sticky left-[100px] z-10 bg-[#12141d] px-2 py-1 text-gray-300 border-r border-gray-800 whitespace-nowrap truncate max-w-[180px]" title={pr.locName}>{pr.locName}</td>
                              {dods.map((d, i) => (
                                <td
                                  key={nomsPivot.dates[i]}
                                  className="px-1 py-1 text-right whitespace-nowrap font-mono border-r border-gray-800/30"
                                  style={{ backgroundColor: d !== null ? heatBg(d, dodMin, dodMax) : "transparent" }}
                                >
                                  <span className={d !== null ? (d > 0 ? "text-green-400" : d < 0 ? "text-red-400" : "text-gray-500") : "text-gray-600"}>
                                    {d !== null ? (d > 0 ? "+" : "") + fmtNum(d) : "--"}
                                  </span>
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
