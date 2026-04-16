import { NextResponse } from "next/server";
import { readParquet } from "@/lib/azure-parquet";
import type { PjmLoadForecastRow } from "@/lib/pjm-types";

export const dynamic = "force-dynamic";

const CONTAINER = process.env.AZURE_CONTAINER_NAME ?? "helioscta";
const BLOB_PATH = "pjm_cleaned/pjm_load_forecast_hourly.parquet";

const CACHE_TTL_MS = 30 * 60 * 1000;
let filtersCache: { expiresAt: number; payload: unknown } | null = null;

export async function GET() {
  if (filtersCache && Date.now() < filtersCache.expiresAt) {
    return NextResponse.json(filtersCache.payload, {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300",
      },
    });
  }

  try {
    const rows = await readParquet<PjmLoadForecastRow>(CONTAINER, BLOB_PATH);

    const toDateStr = (d: string | Date) =>
      typeof d === "string" && d.length === 10
        ? d
        : new Date(d).toISOString().slice(0, 10);

    const regionSet = new Set<string>();
    const rankSet = new Set<number>();
    let minDate = "";
    let maxDate = "";

    for (const row of rows) {
      regionSet.add(row.region);
      rankSet.add(Number(row.forecast_rank));
      const d = toDateStr(row.forecast_date);
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }

    const payload = {
      regions: [...regionSet].sort(),
      ranks: [...rankSet].sort((a, b) => a - b),
      dateRange: { min: minDate, max: maxDate },
    };

    filtersCache = { expiresAt: Date.now() + CACHE_TTL_MS, payload };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("[pjm/load-forecast/filters] Parquet read failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch PJM load forecast filter options" },
      { status: 500 }
    );
  }
}
