import { NextResponse } from "next/server";
import { readParquet, invalidateCache } from "@/lib/azure-parquet";
import type { PjmLoadForecastRow } from "@/lib/pjm-types";

export const dynamic = "force-dynamic";

const CONTAINER = process.env.AZURE_CONTAINER_NAME ?? "helioscta";
const BLOB_PATH = "pjm_cleaned/pjm_load_forecast_hourly.parquet";

const CACHE_TTL_MS = 5 * 60 * 1000;
const RESPONSE_CACHE = new Map<
  string,
  { expiresAt: number; payload: unknown }
>();

function toISODate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const toDateStr = (d: string | Date) =>
  typeof d === "string" && d.length === 10
    ? d
    : new Date(d).toISOString().slice(0, 10);

/** Normalize a Date|string from hyparquet to an ISO string */
const toISOStr = (d: string | Date) =>
  d instanceof Date ? d.toISOString() : typeof d === "string" ? d : new Date(d).toISOString();

/** POST = invalidate all caches and pull fresh from blob storage */
export async function POST() {
  invalidateCache(CONTAINER, BLOB_PATH);
  RESPONSE_CACHE.clear();
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startDate = toISODate(searchParams.get("start"));
  const endDate = toISODate(searchParams.get("end"));
  const regionParam = searchParams.get("region") || null;
  const rankParam = searchParams.get("rank") || null;
  const latest = searchParams.get("latest") === "true";
  const vintagesMode = searchParams.get("vintages") === "true";
  const limitRaw = parseInt(searchParams.get("limit") || "500", 10);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50000) : 500;
  const offsetRaw = parseInt(searchParams.get("offset") || "0", 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  const cacheKey = `${startDate}:${endDate}:${regionParam}:${rankParam}:${latest}:${vintagesMode}:${limit}:${offset}`;
  const cached = RESPONSE_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.payload, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  }

  try {
    const allRows = await readParquet<PjmLoadForecastRow>(CONTAINER, BLOB_PATH);

    const regions = regionParam
      ? new Set(regionParam.split(",").filter(Boolean))
      : null;
    const ranks = rankParam
      ? new Set(rankParam.split(",").map(Number).filter(Number.isFinite))
      : null;

    let filtered = allRows;

    if (startDate) {
      filtered = filtered.filter((r) => toDateStr(r.forecast_date) >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter((r) => toDateStr(r.forecast_date) <= endDate);
    }
    if (regions) {
      filtered = filtered.filter((r) => regions.has(r.region));
    }
    if (ranks) {
      filtered = filtered.filter((r) => ranks.has(Number(r.forecast_rank)));
    }

    // latest=true: keep only the highest rank (most recent revision) per forecast_date+region
    if (latest) {
      const maxRank = new Map<string, number>();
      for (const r of filtered) {
        const key = `${toDateStr(r.forecast_date)}|${r.region}`;
        const rank = Number(r.forecast_rank);
        const cur = maxRank.get(key);
        if (cur === undefined || rank > cur) maxRank.set(key, rank);
      }
      filtered = filtered.filter((r) => {
        const key = `${toDateStr(r.forecast_date)}|${r.region}`;
        return Number(r.forecast_rank) === maxRank.get(key);
      });
    }

    // vintages=true: for each forecast_date+region, keep only 4 key vintages
    // (latest, DA-12h, DA-24h, DA-48h) to avoid sending all revisions
    if (vintagesMode) {
      const VINTAGE_OFFSETS = [0, 12, 24, 48]; // hours before latest
      const byGroup = new Map<string, typeof filtered>();
      for (const r of filtered) {
        const key = `${toDateStr(r.forecast_date)}|${r.region}`;
        let arr = byGroup.get(key);
        if (!arr) { arr = []; byGroup.set(key, arr); }
        arr.push(r);
      }

      const kept = new Set<string>(); // exec datetimes to keep
      for (const [, groupRows] of byGroup) {
        const execSet = new Set(groupRows.map((r) => toISOStr(r.forecast_execution_datetime_local)));
        const sortedExecs = [...execSet].sort();
        if (sortedExecs.length === 0) continue;
        const latestExec = sortedExecs[sortedExecs.length - 1];
        const latestMs = new Date(latestExec).getTime();

        for (const hoursBack of VINTAGE_OFFSETS) {
          const cutoffMs = latestMs - hoursBack * 3600_000;
          for (let i = sortedExecs.length - 1; i >= 0; i--) {
            if (new Date(sortedExecs[i]).getTime() <= cutoffMs) {
              kept.add(sortedExecs[i]);
              break;
            }
          }
        }
      }

      filtered = filtered.filter((r) =>
        kept.has(toISOStr(r.forecast_execution_datetime_local))
      );
    }

    // Sort: newest forecast_date first, then by hour ascending
    filtered.sort((a, b) => {
      const dateCmp = toDateStr(b.forecast_date).localeCompare(
        toDateStr(a.forecast_date)
      );
      if (dateCmp !== 0) return dateCmp;
      return Number(a.hour_ending) - Number(b.hour_ending);
    });

    const totalCount = filtered.length;
    const rows = filtered.slice(offset, offset + limit).map((r) => ({
      forecast_execution_datetime_utc: toISOStr(r.forecast_execution_datetime_utc),
      timezone: r.timezone,
      forecast_execution_datetime_local: toISOStr(r.forecast_execution_datetime_local),
      forecast_rank: Number(r.forecast_rank),
      forecast_execution_date: toDateStr(r.forecast_execution_date),
      forecast_datetime: toISOStr(r.forecast_datetime),
      forecast_date: toDateStr(r.forecast_date),
      hour_ending: Number(r.hour_ending),
      region: r.region,
      forecast_load_mw: Number(r.forecast_load_mw),
    }));

    const payload = { rows, totalCount };
    RESPONSE_CACHE.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload,
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("[pjm/load-forecast] Parquet read failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch PJM load forecast data" },
      { status: 500 }
    );
  }
}
