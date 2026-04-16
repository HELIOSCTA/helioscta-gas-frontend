import { NextResponse } from "next/server";
import { readParquet } from "@/lib/azure-parquet";
import type { PjmLmpRow } from "@/lib/pjm-types";

export const dynamic = "force-dynamic";

const CONTAINER = process.env.AZURE_CONTAINER_NAME ?? "helioscta";
const BLOB_PATH = "pjm_cleaned/pjm_lmps_hourly.parquet";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes — filter options change rarely
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
    const rows = await readParquet<PjmLmpRow>(CONTAINER, BLOB_PATH);

    const toDateStr = (d: string | Date) =>
      typeof d === "string" && d.length === 10 ? d : new Date(d).toISOString().slice(0, 10);

    const hubSet = new Set<string>();
    const marketSet = new Set<string>();
    let minDate = "";
    let maxDate = "";

    for (const row of rows) {
      hubSet.add(row.hub);
      marketSet.add(row.market);
      const d = toDateStr(row.date);
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }

    const payload = {
      hubs: [...hubSet].sort(),
      markets: [...marketSet].sort(),
      dateRange: { min: minDate, max: maxDate },
    };

    filtersCache = { expiresAt: Date.now() + CACHE_TTL_MS, payload };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("[pjm/lmps/filters] Parquet read failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch PJM LMP filter options" },
      { status: 500 }
    );
  }
}
