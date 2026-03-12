"use client";

import { useEffect, useState, useCallback } from "react";

/* ── Types ───────────────────────────────────────────────────────── */

interface LocationData {
  locationRoleId: number;
  locName: string;
  latestNom: number;
  dod: number | null;
  avg7d: number | null;
  avg30d: number | null;
  delta7d: number | null;
  delta30d: number | null;
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
  summaryDod: number | null;
  summaryDelta7d: number | null;
  summaryDelta30d: number | null;
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
        <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-sm ${deltaClass(loc.dod)}`}>
          {fmtDelta(loc.dod)}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-sm text-gray-400">
          {fmtNum(loc.avg7d)}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-sm text-gray-400">
          {fmtNum(loc.avg30d)}
        </td>
        <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-sm ${deltaClass(loc.delta7d)}`}>
          {fmtDelta(loc.delta7d)}
        </td>
        <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-sm ${deltaClass(loc.delta30d)}`}>
          {fmtDelta(loc.delta30d)}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right">
          <Sparkline data={loc.sparkline} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-800/40 bg-gray-900/60">
          <td colSpan={8}>
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
          <span className={deltaClass(pipeline.summaryDod)}>
            DoD {fmtDelta(pipeline.summaryDod)}
          </span>
          <span className={deltaClass(pipeline.summaryDelta7d)}>
            Δ7d {fmtDelta(pipeline.summaryDelta7d)}
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
                  DoD
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-600">
                  7d Avg
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-600">
                  30d Avg
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-600">
                  Δ 7d
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-600">
                  Δ 30d
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latestDay, setLatestDay] = useState<string>("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/noms-movements");
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* Loading */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading nomination movements...
        </div>
      </div>
    );
  }

  /* Error */
  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        Failed to load data: {error}
      </div>
    );
  }

  /* Empty */
  if (pipelines.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-8 text-center text-sm text-gray-500">
        No nomination data found.
      </div>
    );
  }

  const totalLocations = pipelines.reduce((s, p) => s + p.locations.length, 0);

  return (
    <div>
      {/* Controls bar */}
      <div className="mb-4 flex items-center justify-between text-xs text-gray-600">
        <span>
          {pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""} ·{" "}
          {totalLocations} location{totalLocations !== 1 ? "s" : ""}
        </span>
        <span>
          Latest gas day:{" "}
          <span className="text-gray-400">{latestDay}</span>
        </span>
      </div>

      {/* Pipeline cards */}
      <div className="space-y-2">
        {pipelines.map((p) => (
          <PipelineCard key={p.pipelineShortName} pipeline={p} />
        ))}
      </div>
    </div>
  );
}
