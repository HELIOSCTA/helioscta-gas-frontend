"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
import { KRS_WATCHLIST } from "@/lib/watchlists";

/* ------------------------------------------------------------------ */
/*  sessionStorage cache helpers                                       */
/* ------------------------------------------------------------------ */

const CACHE_PREFIX = "krs-watchlist:";

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
    // sessionStorage full or unavailable — silently skip
  }
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface NomRow {
  gas_day: string;
  pipeline_id: number;
  pipeline_name: string;
  pipeline_short_name: string;
  tariff_zone: string;
  tz_id: number;
  state: string;
  county: string;
  loc_name: string;
  location_id: number;
  location_role_id: number;
  facility: string;
  role: string;
  role_code: string;
  interconnecting_entity: string;
  interconnecting_pipeline_short_name: string;
  meter: string;
  drn: string;
  latitude: number;
  longitude: number;
  sign: number;
  cycle_code: string;
  cycle_name: string;
  units: string;
  pipeline_balance_flag: number;
  storage_flag: number;
  scheduled_cap: number;
  signed_scheduled_cap: number;
  no_notice_capacity: number;
  operational_cap: number;
  available_cap: number;
  design_cap: number;
}

type SortField = keyof NomRow;
type SortDir = "asc" | "desc";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FETCH_LIMIT = 5000;
const TABLE_PAGE_SIZE = 100;
const DEFAULT_LOOKBACK = 14;
const WATCHLIST_ROLE_IDS = KRS_WATCHLIST.locationRoleIds;
const ROLE_IDS_PARAM = WATCHLIST_ROLE_IDS.join(",");

const CHART_SERIES = [
  { key: "scheduled", label: "Scheduled", color: "#f97316" },
  { key: "operational", label: "Operational", color: "#3b82f6" },
  { key: "available_cap", label: "Available Cap", color: "#22c55e" },
  { key: "design_cap", label: "Design Cap", color: "#eab308" },
] as const;

const DEFAULT_VISIBLE_SERIES = new Set(["scheduled", "operational"]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtDate(ts: string | null): string {
  if (!ts) return "--";
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtNum(val: number | null | undefined): string {
  if (val == null) return "--";
  return Number(val).toLocaleString();
}

function fmtDateShort(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function lookbackDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function downloadCsv(rows: NomRow[], columns: ColumnDef[]) {
  const header = columns.map((c) => c.label).join(",");
  const csvRows = rows.map((row) =>
    columns
      .map((col) => {
        const val = col.format ? col.format(row) : String(row[col.key] ?? "");
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      })
      .join(",")
  );
  const csv = [header, ...csvRows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `krs_watchlist_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Heat-map background: red (low) → green (high) per-row normalisation */
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

/** Format date for pivot column header: "Mon Mar 2" */
function fmtPivotDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Get the Friday that ends the week containing this date (Sat–Fri weeks) */
function getWeekFriday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0=Sun … 5=Fri 6=Sat
  const diff = day <= 5 ? 5 - day : 6; // Sat(6) → next Fri = +6
  const fri = new Date(d);
  fri.setDate(fri.getDate() + diff);
  return fri.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

interface ColumnDef {
  key: SortField;
  label: string;
  format?: (row: NomRow) => string;
  className?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: "gas_day", label: "Gas Day", format: (r) => fmtDate(r.gas_day) },
  { key: "pipeline_short_name", label: "Pipeline" },
  { key: "cycle_code", label: "Cycle" },
  { key: "cycle_name", label: "Cycle Name" },
  { key: "loc_name", label: "Location" },
  { key: "location_role_id", label: "Role ID", className: "text-right" },
  { key: "facility", label: "Facility" },
  { key: "state", label: "State" },
  { key: "county", label: "County" },
  { key: "role", label: "Role" },
  { key: "role_code", label: "Role Code" },
  { key: "tariff_zone", label: "Tariff Zone" },
  { key: "interconnecting_entity", label: "Interconnect Entity" },
  { key: "interconnecting_pipeline_short_name", label: "Interconnect Pipeline" },
  { key: "meter", label: "Meter" },
  { key: "drn", label: "DRN" },
  {
    key: "scheduled_cap",
    label: "Scheduled",
    format: (r) => fmtNum(r.scheduled_cap),
    className: "text-right",
  },
  {
    key: "signed_scheduled_cap",
    label: "Signed Sched",
    format: (r) => fmtNum(r.signed_scheduled_cap),
    className: "text-right",
  },
  {
    key: "no_notice_capacity",
    label: "No Notice Cap",
    format: (r) => fmtNum(r.no_notice_capacity),
    className: "text-right",
  },
  {
    key: "operational_cap",
    label: "Oper Cap",
    format: (r) => fmtNum(r.operational_cap),
    className: "text-right",
  },
  {
    key: "available_cap",
    label: "Avail Cap",
    format: (r) => fmtNum(r.available_cap),
    className: "text-right",
  },
  {
    key: "design_cap",
    label: "Design Cap",
    format: (r) => fmtNum(r.design_cap),
    className: "text-right",
  },
  { key: "units", label: "Units" },
  {
    key: "sign",
    label: "Sign",
    format: (r) => String(r.sign ?? "--"),
    className: "text-right",
  },
  {
    key: "latitude",
    label: "Lat",
    format: (r) => (r.latitude != null ? Number(r.latitude).toFixed(4) : "--"),
    className: "text-right",
  },
  {
    key: "longitude",
    label: "Lon",
    format: (r) => (r.longitude != null ? Number(r.longitude).toFixed(4) : "--"),
    className: "text-right",
  },
];

/* ------------------------------------------------------------------ */
/*  MultiSelect dropdown                                               */
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
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(filter.toLowerCase())
  );

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const buttonText =
    selected.length === 0
      ? placeholder
      : selected.length <= 2
        ? selected.join(", ")
        : `${selected.length} selected`;

  return (
    <div className="relative flex flex-col gap-1" ref={ref}>
      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </label>
      <button
        onClick={() => setOpen(!open)}
        className={`${width} rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-left text-gray-200 focus:border-gray-500 focus:outline-none truncate`}
      >
        {selected.length === 0 ? (
          <span className="text-gray-600">{placeholder}</span>
        ) : (
          buttonText
        )}
      </button>
      {open && (
        <div
          className={`absolute top-full left-0 z-50 mt-1 ${width} rounded-md border border-gray-700 bg-[#12141d] shadow-xl`}
        >
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

export default function KrsWatchlistTable() {
  /* --- lookback days --- */
  const [lookbackDays, setLookbackDays] = useState(DEFAULT_LOOKBACK);

  /* --- date filters --- */
  const [startDate, setStartDate] = useState(() => lookbackDate(DEFAULT_LOOKBACK));
  const [endDate, setEndDate] = useState(() => todayStr());

  /* --- scoped filter options (pipelines, loc_names, role_ids within watchlist) --- */
  const [allPipelines, setAllPipelines] = useState<string[]>([]);
  const [selectedPipelines, setSelectedPipelines] = useState<string[]>([]);
  const [allLocNames, setAllLocNames] = useState<string[]>([]);
  const [selectedLocNames, setSelectedLocNames] = useState<string[]>([]);
  const [allRoleIds, setAllRoleIds] = useState<string[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [filterLoading, setFilterLoading] = useState(false);

  /* --- data state --- */
  const [rows, setRows] = useState<NomRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* --- sort state --- */
  const [sortField, setSortField] = useState<SortField>("gas_day");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  /* --- collapse states --- */
  const [pivotOpen, setPivotOpen] = useState(true);
  const [chartsOpen, setChartsOpen] = useState(true);
  const [tableOpen, setTableOpen] = useState(true);

  /* --- chart series visibility --- */
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(
    () => new Set(DEFAULT_VISIBLE_SERIES)
  );
  const toggleSeries = useCallback((key: string) => {
    setVisibleSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /* --- column visibility --- */
  const allColumnLabels = useMemo(() => COLUMNS.map((c) => c.label), []);
  const [visibleColumnLabels, setVisibleColumnLabels] = useState<string[]>(allColumnLabels);
  const visibleColumns = useMemo(
    () => COLUMNS.filter((c) => visibleColumnLabels.includes(c.label)),
    [visibleColumnLabels]
  );

  /* --- chart data: one series per location_role_id --- */
  const chartDataByRoleId = useMemo(() => {
    if (rows.length === 0) return [];

    const groups = new Map<
      number,
      { loc_name: string; points: Map<string, { scheduled: number; operational: number; available_cap: number; design_cap: number }> }
    >();

    for (const row of rows) {
      let group = groups.get(row.location_role_id);
      if (!group) {
        group = { loc_name: row.loc_name, points: new Map() };
        groups.set(row.location_role_id, group);
      }
      const day = row.gas_day?.slice(0, 10);
      if (!day) continue;
      const existing = group.points.get(day);
      if (!existing) {
        group.points.set(day, {
          scheduled: row.scheduled_cap ?? 0,
          operational: row.operational_cap ?? 0,
          available_cap: row.available_cap ?? 0,
          design_cap: row.design_cap ?? 0,
        });
      } else {
        existing.scheduled += row.scheduled_cap ?? 0;
        existing.operational += row.operational_cap ?? 0;
        existing.available_cap += row.available_cap ?? 0;
        existing.design_cap += row.design_cap ?? 0;
      }
    }

    return Array.from(groups.entries()).map(([roleId, { loc_name, points }]) => {
      const data = Array.from(points.entries())
        .map(([day, vals]) => ({ gas_day: day, ...vals }))
        .sort((a, b) => a.gas_day.localeCompare(b.gas_day));
      return { roleId, loc_name, data };
    });
  }, [rows]);

  /* --- fetch scoped filter options on mount (cached) --- */
  useEffect(() => {
    const cached = cacheGet<{ pipelines: string[]; loc_names: string[]; role_ids: string[] }>("base-filters");
    if (cached) {
      setAllPipelines(cached.pipelines);
      setAllLocNames(cached.loc_names);
      setAllRoleIds(cached.role_ids);
      return;
    }

    setFilterLoading(true);
    fetch(`/api/genscape-noms/filters?locationRoleIds=${ROLE_IDS_PARAM}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const pipelines: string[] = data.pipelines ?? [];
        const loc_names: string[] = data.loc_names ?? [];
        const role_ids: string[] = (data.location_role_ids ?? []).map(String);
        setAllPipelines(pipelines);
        setAllLocNames(loc_names);
        setAllRoleIds(role_ids);
        cacheSet("base-filters", { pipelines, loc_names, role_ids });
      })
      .catch(() => {})
      .finally(() => setFilterLoading(false));
  }, []);

  /* --- refine filter options when pipeline or loc_name selection changes --- */
  useEffect(() => {
    // No refinement needed if nothing selected
    if (selectedPipelines.length === 0 && selectedLocNames.length === 0) return;

    const params = new URLSearchParams({ locationRoleIds: ROLE_IDS_PARAM });
    if (selectedPipelines.length > 0) params.set("pipelines", selectedPipelines.join(","));
    if (selectedLocNames.length > 0) params.set("locNames", selectedLocNames.join(","));

    const cacheKey = `refined:${params.toString()}`;
    const cached = cacheGet<{ loc_names: string[]; role_ids: string[] }>(cacheKey);
    if (cached) {
      if (selectedPipelines.length > 0) {
        setAllLocNames(cached.loc_names);
        setSelectedLocNames((prev) => prev.filter((n) => cached.loc_names.includes(n)));
      }
      setAllRoleIds(cached.role_ids);
      setSelectedRoleIds((prev) => prev.filter((id) => cached.role_ids.includes(id)));
      return;
    }

    setFilterLoading(true);
    fetch(`/api/genscape-noms/filters?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const loc_names: string[] = data.loc_names ?? [];
        const role_ids: string[] = (data.location_role_ids ?? []).map(String);
        cacheSet(cacheKey, { loc_names, role_ids });
        if (selectedPipelines.length > 0) {
          setAllLocNames(loc_names);
          setSelectedLocNames((prev) => prev.filter((n) => loc_names.includes(n)));
        }
        setAllRoleIds(role_ids);
        setSelectedRoleIds((prev) => prev.filter((id) => role_ids.includes(id)));
      })
      .catch(() => {})
      .finally(() => setFilterLoading(false));
  }, [selectedPipelines, selectedLocNames]);

  /* --- build the effective role IDs for data fetch --- */
  const effectiveRoleIds = useMemo(() => {
    if (selectedRoleIds.length > 0) return selectedRoleIds.join(",");
    return ROLE_IDS_PARAM;
  }, [selectedRoleIds]);

  /* --- fetch data (auto-load on mount, re-fetch on filter/date/offset changes) --- */
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      locationRoleId: effectiveRoleIds,
    });
    if (startDate) params.set("start", startDate);
    if (endDate) params.set("end", endDate);
    if (selectedPipelines.length > 0) params.set("pipeline", selectedPipelines.join(","));
    if (selectedLocNames.length > 0) params.set("locName", selectedLocNames.join(","));

    fetch(`/api/genscape-noms?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setRows(json.rows ?? []);
        setTotalCount(json.total_count ?? 0);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to load KRS watchlist data");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [startDate, endDate, effectiveRoleIds, selectedPipelines, selectedLocNames, offset]);

  /* --- lookback change --- */
  const handleLookbackChange = useCallback((days: number) => {
    setLookbackDays(days);
    setEndDate(todayStr());
    setStartDate(lookbackDate(days));
    setOffset(0);
  }, []);

  /* --- sort handler --- */
  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("desc");
      return field;
    });
  }, []);

  /* --- sort rows client-side --- */
  const sortedRows = [...rows].sort((a, b) => {
    const aVal = a[sortField] ?? "";
    const bVal = b[sortField] ?? "";
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    }
    const cmp = String(aVal).localeCompare(String(bVal));
    return sortDir === "asc" ? cmp : -cmp;
  });

  /* --- pagination --- */
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const goToPage = useCallback((page: number) => {
    setOffset((page - 1) * PAGE_SIZE);
  }, []);

  /* --- sort indicator --- */
  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field)
      return <span className="ml-1 text-gray-600">--</span>;
    return (
      <span className="ml-1 text-gray-400">
        {sortDir === "asc" ? "^" : "v"}
      </span>
    );
  }

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="space-y-5">
      {/* -------- Date Range -------- */}
      <div className="rounded-lg border border-gray-800 bg-[#12141d] p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Date Range
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Lookback Days
            </label>
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
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setOffset(0);
              }}
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
              onChange={(e) => {
                setEndDate(e.target.value);
                setOffset(0);
              }}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* -------- Filters (no Apply — changes auto-refetch) -------- */}
      <div className="rounded-lg border border-gray-800 bg-[#12141d] p-4 space-y-4">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Filters
        </p>
        {filterLoading ? (
          <p className="text-xs text-gray-500 py-1.5">Loading filter options...</p>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <MultiSelect
              label="Pipeline"
              options={allPipelines}
              selected={selectedPipelines}
              onChange={(v) => {
                setSelectedPipelines(v);
                setOffset(0);
              }}
              placeholder="All pipelines..."
              width="w-72"
            />
            <MultiSelect
              label="Location Name"
              options={allLocNames}
              selected={selectedLocNames}
              onChange={(v) => {
                setSelectedLocNames(v);
                setOffset(0);
              }}
              placeholder="All locations..."
              width="w-72"
            />
            <MultiSelect
              label="Location Role ID"
              options={allRoleIds}
              selected={selectedRoleIds}
              onChange={(v) => {
                setSelectedRoleIds(v);
                setOffset(0);
              }}
              placeholder="All role IDs..."
              width="w-56"
            />
          </div>
        )}
      </div>

      {/* ---------- Loading / Error ---------- */}
      {loading && (
        <div className="flex items-center justify-center h-48">
          <div className="text-gray-500">Loading...</div>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center h-48">
          <div className="text-red-400">{error}</div>
        </div>
      )}

      {/* ---------- Charts ---------- */}
      {!loading && !error && chartDataByRoleId.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-[#12141d]">
          <button
            onClick={() => setChartsOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-300">Charts</span>
              <span className="text-xs text-gray-500">
                {chartDataByRoleId.length} location role{chartDataByRoleId.length !== 1 ? "s" : ""}
              </span>
            </div>
            <span className="text-gray-500 text-sm">
              {chartsOpen ? "v" : ">"}
            </span>
          </button>

          {chartsOpen && (
            <div className="border-t border-gray-800 p-4 space-y-4">
              {/* Series toggle buttons */}
              <div className="flex flex-wrap gap-2">
                {CHART_SERIES.map(({ key, label, color }) => {
                  const active = visibleSeries.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggleSeries(key)}
                      className={`flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs transition-colors ${
                        active
                          ? "border-gray-600 bg-gray-800 text-gray-200"
                          : "border-gray-800 bg-transparent text-gray-600"
                      }`}
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: active ? color : "#374151" }}
                      />
                      {label}
                    </button>
                  );
                })}
              </div>

              {chartDataByRoleId.map(({ roleId, loc_name, data }) => (
                <div
                  key={roleId}
                  className="rounded-xl border border-gray-800 bg-[#0f1117] p-4"
                >
                  <p className="mb-3 text-xs font-medium text-gray-300">
                    <span className="text-gray-500">Role ID</span> {roleId}
                    {loc_name && (
                      <>
                        {" "}<span className="text-gray-500">|</span> {loc_name}
                      </>
                    )}
                  </p>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis
                        dataKey="gas_day"
                        tickFormatter={fmtDateShort}
                        tick={{ fill: "#6b7280", fontSize: 11 }}
                        stroke="#374151"
                      />
                      <YAxis
                        tickFormatter={(v: number) => v.toLocaleString()}
                        tick={{ fill: "#6b7280", fontSize: 11 }}
                        stroke="#374151"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1f2937",
                          border: "1px solid #374151",
                          borderRadius: "8px",
                          fontSize: 12,
                        }}
                        labelFormatter={fmtDateShort}
                        formatter={(value: number) => value.toLocaleString()}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
                      {CHART_SERIES.map(({ key, label, color }) =>
                        visibleSeries.has(key) ? (
                          <Line
                            key={key}
                            type="monotone"
                            dataKey={key}
                            name={label}
                            stroke={color}
                            strokeWidth={2}
                            dot={false}
                          />
                        ) : null
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------- Table ---------- */}
      {!loading && !error && (
        <div className="rounded-xl border border-gray-800 bg-[#12141d]">
          <button
            onClick={() => setTableOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-300">Data Table</span>
              <span className="text-xs text-gray-500">
                {totalCount.toLocaleString()} rows | Page {currentPage} of {totalPages || 1}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {rows.length > 0 && (
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadCsv(sortedRows, visibleColumns);
                  }}
                  className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-700"
                >
                  Download CSV
                </span>
              )}
              <span className="text-gray-500 text-sm">
                {tableOpen ? "v" : ">"}
              </span>
            </div>
          </button>

          {tableOpen && (
            <>
              {/* Column picker */}
              <div className="flex items-end gap-3 border-t border-gray-800 px-4 py-3">
                <MultiSelect
                  label="Columns"
                  options={allColumnLabels}
                  selected={visibleColumnLabels}
                  onChange={setVisibleColumnLabels}
                  placeholder="Select columns..."
                  width="w-72"
                />
                <button
                  onClick={() => setVisibleColumnLabels(allColumnLabels)}
                  className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700"
                >
                  Select All
                </button>
                <button
                  onClick={() => setVisibleColumnLabels([])}
                  className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700"
                >
                  Clear All
                </button>
              </div>

              <div className="overflow-x-auto border-t border-gray-800">
                <table
                  className="w-full text-sm border-collapse"
                  style={{ minWidth: `${visibleColumns.length * 120}px` }}
                >
                  <thead>
                    <tr>
                      {visibleColumns.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className={`cursor-pointer px-3 py-2 text-left text-xs font-medium text-gray-400 border-b border-gray-700 whitespace-nowrap hover:text-gray-200 ${col.className ?? ""}`}
                        >
                          {col.label} <SortIcon field={col.key} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={visibleColumns.length}
                          className="px-3 py-8 text-center text-sm text-gray-600"
                        >
                          No data found for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      sortedRows.map((row, idx) => (
                        <tr
                          key={`${row.location_role_id}-${row.gas_day}-${row.cycle_code}-${idx}`}
                          className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${
                            idx % 2 === 0 ? "bg-[#0f1117]" : "bg-[#12141d]"
                          }`}
                        >
                          {visibleColumns.map((col) => (
                            <td
                              key={col.key}
                              className={`px-3 py-1.5 text-sm text-gray-300 whitespace-nowrap ${col.className ?? ""}`}
                            >
                              {col.format
                                ? col.format(row)
                                : String(row[col.key] ?? "--")}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 border-t border-gray-800 py-3">
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 7) {
                      page = i + 1;
                    } else if (currentPage <= 4) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 3) {
                      page = totalPages - 6 + i;
                    } else {
                      page = currentPage - 3 + i;
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => goToPage(page)}
                        className={`rounded-md px-3 py-1 text-xs transition-colors ${
                          page === currentPage
                            ? "bg-gray-600 text-white"
                            : "border border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
