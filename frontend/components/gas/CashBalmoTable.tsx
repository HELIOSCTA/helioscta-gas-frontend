"use client";

import { useState, useEffect } from "react";

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

interface LocationDef {
  key: string;
  label: string;
  hasBasis: boolean;
}

interface RegionDef {
  name: string;
  locations: LocationDef[];
}

const REGIONS: RegionDef[] = [
  {
    name: "LA / SOUTH EAST",
    locations: [
      { key: "hh", label: "HENRY HUB", hasBasis: false },
      { key: "transco_st85", label: "TRANSCO ST85 (Zone 4)", hasBasis: true },
      { key: "pine_prarie", label: "PINE PRAIRIE", hasBasis: true },
    ],
  },
  {
    name: "EAST TEXAS",
    locations: [
      { key: "waha", label: "WAHA", hasBasis: true },
    ],
  },
  {
    name: "NORTHEAST",
    locations: [
      { key: "transco_zone_5_south", label: "TRANSCO ZONE 5 SOUTH", hasBasis: true },
      { key: "tetco_m3", label: "TETCO M3", hasBasis: true },
      { key: "agt", label: "AGT", hasBasis: true },
      { key: "iroquois_z2", label: "IROQUOIS Z2", hasBasis: true },
    ],
  },
  {
    name: "WEST",
    locations: [
      { key: "socal_cg", label: "SOCAL CITYGATE", hasBasis: true },
      { key: "pge_cg", label: "PG&E CITYGATE", hasBasis: true },
    ],
  },
  {
    name: "ROCKIES / NORTHWEST",
    locations: [
      { key: "cig", label: "CIG", hasBasis: true },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

function getNum(row: Row, key: string, field: string): number | null {
  const v = row[`${key}_${field}`];
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtPrice(v: number | null): string {
  if (v === null) return "—";
  return v.toFixed(3);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]}-${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCFullYear()).slice(-2)}`;
}

function ColoredValue({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-600">—</span>;
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1.5 ${positive ? "text-green-400" : "text-red-400"}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${positive ? "bg-green-400" : "bg-red-400"}`} />
      {positive ? "+" : ""}{value.toFixed(2)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Location mini-table                                                */
/* ------------------------------------------------------------------ */

function LocationTable({ rows, loc }: { rows: Row[]; loc: LocationDef }) {
  const hasData = rows.some((r) => getNum(r, loc.key, "cash") !== null);
  if (!hasData) return null;

  return (
    <div className="mb-5">
      <h4 className="mb-2 text-[13px] font-bold tracking-wide text-gray-200">{loc.label}</h4>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-[13px]">
          <thead>
            <tr className="border-b border-gray-700 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              <th className="py-1.5 pr-4 text-left">Trade Day</th>
              {loc.hasBasis && <th className="px-3 py-1.5 text-right">Basis</th>}
              <th className="px-3 py-1.5 text-right">Cash</th>
              <th className="px-3 py-1.5 text-right">Balmo</th>
              <th className="px-3 py-1.5 text-right">Cash-Balmo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const cash = getNum(row, loc.key, "cash");
              const balmo = getNum(row, loc.key, "balmo");
              const cashBalmo = getNum(row, loc.key, "cash_balmo");
              const basis = loc.hasBasis ? getNum(row, loc.key, "basis") : null;

              if (cash === null && balmo === null) return null;

              return (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-1.5 pr-4 font-mono text-gray-400">
                    {formatDate(row.trade_date as string)}
                  </td>
                  {loc.hasBasis && (
                    <td className="px-3 py-1.5 text-right font-mono">
                      <ColoredValue value={basis} />
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-right font-mono text-gray-300">
                    {fmtPrice(cash)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-300">
                    {fmtPrice(balmo)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    <ColoredValue value={cashBalmo} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

function defaultDates() {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 10 * 86_400_000).toISOString().slice(0, 10);
  return { start, end };
}

export default function CashBalmoTable() {
  const defaults = defaultDates();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/ice-cash-balmo?startDate=${startDate}&endDate=${endDate}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setRows(data.rows ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  return (
    <div>
      {/* Controls */}
      <div className="mb-5 flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-semibold uppercase tracking-wider">Start</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-300 focus:border-gray-500 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-semibold uppercase tracking-wider">End</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-300 focus:border-gray-500 focus:outline-none"
          />
        </label>
      </div>

      {/* States */}
      {loading && (
        <div className="flex items-center gap-2 py-12 text-sm text-gray-500">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading ICE cash-balmo data...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          Failed to load data: {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-600">No data available.</p>
      )}

      {/* Data */}
      {!loading && !error && rows.length > 0 && (
        <div className="space-y-8">
          {REGIONS.map((region) => (
            <div key={region.name}>
              <h3 className="mb-3 border-b border-gray-700 pb-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                {region.name}
              </h3>
              {region.locations.map((loc) => (
                <LocationTable key={loc.key} rows={rows} loc={loc} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
