"use client";

import { useState, useCallback, useEffect } from "react";
import MultiSelect from "@/components/ui/MultiSelect";

/* ── Types ───────────────────────────────────────────────────────── */

interface LocationData {
  locationRoleId: number;
  locName: string;
  latestNom: number;
  avg1d: number | null;
  avg7d: number | null;
  delta1d: number | null;
  delta7d: number | null;
  sparkline: number[];
  metadata: Record<string, unknown>;
}

interface PipelineGroup {
  pipelineShortName: string;
  pipelineName: string;
  pipelineId: number;
  regions: string[];
  latestDay: string;
  summaryLatest: number;
  summaryDelta1d: number | null;
  summaryDelta7d: number | null;
  locations: LocationData[];
}

/* ── Formatters ──────────────────────────────────────────────────── */

function fmtNum(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString();
}

function fmtDelta(v: number | null): string {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toLocaleString()}`;
}

function deltaClass(v: number | null): string {
  if (v === null || v === 0) return "text-gray-500";
  return v > 0 ? "text-emerald-400" : "text-red-400";
}

/* ── Sparkline (pure SVG) ────────────────────────────────────────── */

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return <span className="text-gray-700">—</span>;
  const w = 72;
  const h = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - 2 - ((v - min) / range) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const trend = data[data.length - 1] >= data[0] ? "#34d399" : "#f87171";
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline
        points={points}
        fill="none"
        stroke={trend}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Chevron icon ────────────────────────────────────────────────── */

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-gray-600 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

/* ── Metadata detail panel ───────────────────────────────────────── */

const META_FIELDS: { key: string; label: string }[] = [
  { key: "pipeline_id", label: "Pipeline ID" },
  { key: "pipeline_name", label: "Pipeline Name" },
  { key: "pipeline_short_name", label: "Pipeline Short" },
  { key: "tariff_zone", label: "Tariff Zone" },
  { key: "tz_id", label: "TZ ID" },
  { key: "state", label: "State" },
  { key: "county", label: "County" },
  { key: "loc_name", label: "Location Name" },
  { key: "location_id", label: "Location ID" },
  { key: "location_role_id", label: "Location Role ID" },
  { key: "facility", label: "Facility" },
  { key: "role", label: "Role" },
  { key: "role_code", label: "Role Code" },
  { key: "interconnecting_entity", label: "Interconnecting Entity" },
  { key: "interconnecting_pipeline_short_name", label: "Interconnecting Pipeline" },
  { key: "meter", label: "Meter" },
  { key: "drn", label: "DRN" },
  { key: "latitude", label: "Latitude" },
  { key: "longitude", label: "Longitude" },
  { key: "sign", label: "Sign" },
  { key: "cycle_code", label: "Cycle Code" },
  { key: "cycle_name", label: "Cycle Name" },
  { key: "units", label: "Units" },
  { key: "pipeline_balance_flag", label: "Balance Flag" },
  { key: "storage_flag", label: "Storage Flag" },
];

function MetadataPanel({ metadata }: { metadata: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-1 px-4 py-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {META_FIELDS.map(({ key, label }) => {
        const val = metadata[key];
        if (val === null || val === undefined || val === "") return null;
        return (
          <div key={key} className="flex items-baseline gap-1.5 text-[11px]">
            <span className="font-medium text-gray-600">{label}:</span>
            <span className="text-gray-400">{String(val)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Location row ────────────────────────────────────────────────── */

function LocationRow({ loc }: { loc: LocationData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className="cursor-pointer border-b border-gray-800/40 transition-colors hover:bg-gray-800/20"
      >
        <td className="whitespace-nowrap py-2.5 pl-8 pr-3 text-sm text-gray-300">
          <div className="flex items-center gap-2">
            <Chevron open={expanded} />
            <span>{loc.locName}</span>
            <span className="text-[10px] text-gray-600">#{loc.locationRoleId}</span>
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-sm text-gray-200">
          {fmtNum(loc.latestNom)}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-sm text-gray-400">
          {fmtNum(loc.avg1d)}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-sm text-gray-400">
          {fmtNum(loc.avg7d)}
        </td>
        <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-sm ${deltaClass(loc.delta1d)}`}>
          {fmtDelta(loc.delta1d)}
        </td>
        <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-sm ${deltaClass(loc.delta7d)}`}>
          {fmtDelta(loc.delta7d)}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right">
          <Sparkline data={loc.sparkline} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-800/40 bg-gray-900/60">
          <td colSpan={7}>
            <MetadataPanel metadata={loc.metadata} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Pipeline card ───────────────────────────────────────────────── */

function PipelineCard({ pipeline }: { pipeline: PipelineGroup }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-800 bg-[#0d1017]">
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-800/30"
      >
        {/* Colored dot */}
        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-purple-500" />

        {/* Pipeline name + regions */}
        <div className="mr-auto min-w-0">
          <span className="text-sm font-bold text-gray-100">
            {pipeline.pipelineShortName}
          </span>
          <span className="ml-2 truncate text-xs text-gray-600">
            {pipeline.regions.slice(0, 6).join(" · ")}
            {pipeline.regions.length > 6 && ` +${pipeline.regions.length - 6}`}
          </span>
        </div>

        {/* Summary stats */}
        <div className="flex flex-shrink-0 items-center gap-4 text-sm tabular-nums">
          <span className="font-semibold text-gray-200">
            {fmtNum(pipeline.summaryLatest)}
          </span>
          <span className={deltaClass(pipeline.summaryDelta1d)}>
            Delta 1d {fmtDelta(pipeline.summaryDelta1d)}
          </span>
          <span className={deltaClass(pipeline.summaryDelta7d)}>
            Delta 7d {fmtDelta(pipeline.summaryDelta7d)}
          </span>
        </div>

        <Chevron open={open} />
      </button>

      {/* Expanded table */}
      {open && (
        <div className="border-t border-gray-800">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                <th className="whitespace-nowrap py-2 pl-8 pr-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-600">
                  Location
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-600">
                  Today
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-600">
                  1d Avg
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-600">
                  7d Avg
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-600">
                  Delta 1d
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-600">
                  Delta 7d
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-600">
                  7-day
                </th>
              </tr>
            </thead>
            <tbody>
              {pipeline.locations.map((loc) => (
                <LocationRow key={loc.locationRoleId} loc={loc} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */

export default function NomsMovements() {
  const [pipelines, setPipelines] = useState<PipelineGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestDay, setLatestDay] = useState<string>("");
  const [allPipelines, setAllPipelines] = useState<string[]>([]);
  const [selectedPipelines, setSelectedPipelines] = useState<string[]>([]);
  const [thresholdInput, setThresholdInput] = useState<string>("0");
  const [appliedThreshold, setAppliedThreshold] = useState<number | null>(null);
  const [appliedPipelines, setAppliedPipelines] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/genscape-noms/filters")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setAllPipelines(data.pipelines ?? []))
      .catch(() => setAllPipelines([]));
  }, []);

  const fetchData = useCallback(async (threshold: number, pipelineFilter: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ threshold: String(threshold) });
      if (pipelineFilter.length > 0) {
        params.set("pipeline", pipelineFilter.join(","));
      }

      const res = await fetch(`/api/noms-movements?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPipelines(data.pipelines ?? []);
      setLatestDay(data.latestDay ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const applyFilters = useCallback(() => {
    const parsed = Number.parseFloat(thresholdInput);
    const threshold = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    const nextPipelines = [...selectedPipelines];

    setAppliedThreshold(threshold);
    setAppliedPipelines(nextPipelines);
    void fetchData(threshold, nextPipelines);
  }, [fetchData, selectedPipelines, thresholdInput]);

  const hasApplied = appliedThreshold !== null;
  const totalLocations = pipelines.reduce((s, p) => s + p.locations.length, 0);

  return (
    <div>
      <div className="mb-4 rounded-lg border border-gray-800 bg-gray-900/40 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <MultiSelect
            label="Pipeline"
            options={allPipelines}
            selected={selectedPipelines}
            onChange={setSelectedPipelines}
            placeholder="All pipelines..."
            width="w-72"
          />
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Threshold (abs Delta 1d or Delta 7d)
            </label>
            <input
              type="number"
              min={0}
              step={1000}
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              className="w-40 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
            />
          </div>
          <button
            onClick={applyFilters}
            disabled={loading}
            className="rounded-md border border-blue-500/40 bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Loading..." : "Apply"}
          </button>
        </div>

        {hasApplied && !loading && !error && (
          <div className="mt-3 flex flex-wrap items-center justify-between text-xs text-gray-600">
            <span>
              {pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""} · {totalLocations} location{totalLocations !== 1 ? "s" : ""}
            </span>
            <span>
              Pipelines: <span className="text-gray-400">{appliedPipelines.length > 0 ? appliedPipelines.length.toLocaleString() : "All"}</span> · Threshold:{" "}
              <span className="text-gray-400">{appliedThreshold?.toLocaleString()}</span> · Latest gas day: <span className="text-gray-400">{latestDay}</span>
            </span>
          </div>
        )}
      </div>

      {!hasApplied && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-8 text-center text-sm text-gray-500">
          Select pipelines and threshold, then click Apply to load nomination movements.
        </div>
      )}

      {hasApplied && loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading nomination movements...
          </div>
        </div>
      )}

      {hasApplied && !loading && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Failed to load data: {error}
        </div>
      )}

      {hasApplied && !loading && !error && pipelines.length === 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-8 text-center text-sm text-gray-500">
          No nomination data found for this filter selection.
        </div>
      )}

      {hasApplied && !loading && !error && pipelines.length > 0 && (
        <div className="space-y-2">
          {pipelines.map((p) => (
            <PipelineCard key={p.pipelineShortName} pipeline={p} />
          ))}
        </div>
      )}
    </div>
  );
}