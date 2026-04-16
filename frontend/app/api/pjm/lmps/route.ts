import { NextResponse } from "next/server";
import { readParquet } from "@/lib/azure-parquet";
import type { PjmLmpRow } from "@/lib/pjm-types";

export const dynamic = "force-dynamic";

const CONTAINER = process.env.AZURE_CONTAINER_NAME ?? "helioscta";
const BLOB_PATH = "pjm_cleaned/pjm_lmps_hourly.parquet";

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startDate = toISODate(searchParams.get("start"));
  const endDate = toISODate(searchParams.get("end"));
  const hubParam = searchParams.get("hub") || null;
  const marketParam = searchParams.get("market") || null;
  const limitRaw = parseInt(searchParams.get("limit") || "500", 10);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : 500;
  const offsetRaw = parseInt(searchParams.get("offset") || "0", 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  const cacheKey = `${startDate}:${endDate}:${hubParam}:${marketParam}:${limit}:${offset}`;
  const cached = RESPONSE_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.payload, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  }

  try {
    const allRows = await readParquet<PjmLmpRow>(CONTAINER, BLOB_PATH);

    const hubs = hubParam
      ? new Set(hubParam.split(",").filter(Boolean))
      : null;
    const markets = marketParam
      ? new Set(marketParam.split(",").filter(Boolean))
      : null;

    // Normalize date column: Parquet returns ISO timestamps like "2026-04-03T00:00:00.000Z"
    // but filters use "2026-04-03" format
    const toDateStr = (d: string | Date) =>
      typeof d === "string" && d.length === 10 ? d : new Date(d).toISOString().slice(0, 10);

    let filtered = allRows;

    if (startDate) {
      filtered = filtered.filter((r) => toDateStr(r.date) >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter((r) => toDateStr(r.date) <= endDate);
    }
    if (hubs) {
      filtered = filtered.filter((r) => hubs.has(r.hub));
    }
    if (markets) {
      filtered = filtered.filter((r) => markets.has(r.market));
    }

    // Sort: newest first, then by hour descending
    filtered.sort((a, b) => {
      const dateCmp = toDateStr(b.date).localeCompare(toDateStr(a.date));
      if (dateCmp !== 0) return dateCmp;
      return b.hour_ending - a.hour_ending;
    });

    const totalCount = filtered.length;
    // Normalize dates to "YYYY-MM-DD" in the response
    const rows = filtered.slice(offset, offset + limit).map((r) => ({
      ...r,
      date: toDateStr(r.date),
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
    console.error("[pjm/lmps] Parquet read failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch PJM LMP data" },
      { status: 500 }
    );
  }
}
