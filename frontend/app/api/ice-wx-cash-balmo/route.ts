import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
const RESPONSE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  rows: unknown[];
};

const routeCache = new Map<string, CacheEntry>();

/**
 * Accepts ?month=3&startYear=2020
 * Returns weather + price data for the given month across all years >= startYear.
 *
 * Builds a set of date ranges (one per year) for the target month so that
 * WHERE clauses use plain date comparisons instead of EXTRACT / TO_CHAR,
 * allowing the database to use indexes on date / gas_day columns.
 *
 * $1 = month (1-12), $2 = startYear, $3 = upper-bound date (end of current month).
 * $4 = date-ranges SQL fragment is injected server-side (see buildDateRanges).
 */

function buildDateRanges(month: number, startYear: number, endYear: number): string {
  const parts: string[] = [];
  const mm = String(month).padStart(2, "0");
  for (let y = startYear; y <= endYear; y++) {
    // last day of the month: go to first of next month and subtract a day
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? y + 1 : y;
    const nmm = String(nextMonth).padStart(2, "0");
    parts.push(`(date >= '${y}-${mm}-01' AND date < '${nextYear}-${nmm}-01')`);
  }
  return parts.join(" OR ");
}

function buildGasDayRanges(month: number, startYear: number, endYear: number): string {
  const parts: string[] = [];
  const mm = String(month).padStart(2, "0");
  for (let y = startYear; y <= endYear; y++) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? y + 1 : y;
    const nmm = String(nextMonth).padStart(2, "0");
    parts.push(`(gas_day >= '${y}-${mm}-01' AND gas_day < '${nextYear}-${nmm}-01')`);
  }
  return parts.join(" OR ");
}

function buildSQL(month: number, startYear: number): string {
  const now = new Date();
  // End year: current year (we'll cap by upper-bound date)
  const endYear = now.getFullYear();
  // Upper-bound: end of current month
  const curMonth = now.getMonth() + 1;
  const nextM = curMonth === 12 ? 1 : curMonth + 1;
  const nextY = curMonth === 12 ? endYear + 1 : endYear;
  const upperBound = `'${nextY}-${String(nextM).padStart(2, "0")}-01'`;

  const dateRanges = buildDateRanges(month, startYear, endYear);
  const gasDayRanges = buildGasDayRanges(month, startYear, endYear);

  return `
WITH DAILY_WDD AS (
    SELECT
        date
        ,EXTRACT(YEAR FROM date)::int AS year
        ,EXTRACT(MONTH FROM date)::int AS month
        ,TO_CHAR(date, 'Dy') AS day_of_week
        ,upper(region) AS station_name
        ,gas_hdd
        ,normals_gas_hdd
    FROM wsi_wdd_v1_2026_jan_07.staging_v1_daily_wdd_observed_forecasts_and_normals
    WHERE (${dateRanges})
        AND date < ${upperBound}
        AND region IN ('CONUS','EAST','MIDWEST','MOUNTAIN','PACIFIC','SOUTHCENTRAL')
),

DAILY_WDD_PIVOT AS (
    SELECT
        date
        ,year
        ,month
        ,day_of_week

        ,AVG(CASE WHEN station_name = 'CONUS' THEN gas_hdd END) AS conus_gas_hdd
        ,AVG(CASE WHEN station_name = 'CONUS' THEN normals_gas_hdd END) AS conus_normals_gas_hdd
        ,AVG(CASE WHEN station_name = 'EAST' THEN gas_hdd END) AS east_gas_hdd
        ,AVG(CASE WHEN station_name = 'EAST' THEN normals_gas_hdd END) AS east_normals_gas_hdd
        ,AVG(CASE WHEN station_name = 'MIDWEST' THEN gas_hdd END) AS midwest_gas_hdd
        ,AVG(CASE WHEN station_name = 'MIDWEST' THEN normals_gas_hdd END) AS midwest_normals_gas_hdd
        ,AVG(CASE WHEN station_name = 'MOUNTAIN' THEN gas_hdd END) AS mountain_gas_hdd
        ,AVG(CASE WHEN station_name = 'MOUNTAIN' THEN normals_gas_hdd END) AS mountain_normals_gas_hdd
        ,AVG(CASE WHEN station_name = 'PACIFIC' THEN gas_hdd END) AS pacific_gas_hdd
        ,AVG(CASE WHEN station_name = 'PACIFIC' THEN normals_gas_hdd END) AS pacific_normals_gas_hdd
        ,AVG(CASE WHEN station_name = 'SOUTHCENTRAL' THEN gas_hdd END) AS southcentral_gas_hdd
        ,AVG(CASE WHEN station_name = 'SOUTHCENTRAL' THEN normals_gas_hdd END) AS southcentral_normals_gas_hdd

    FROM DAILY_WDD
    GROUP BY date, year, month, day_of_week
),

NEXT_DAY_GAS AS (
    SELECT
        gas_day
        ,hh_cash
        ,transco_st85_cash
        ,pine_prarie_cash
        ,waha_cash
        ,houston_ship_channel_cash
        ,ngpl_txok_cash
        ,transco_zone_5_south_cash
        ,tetco_m3_cash
        ,agt_cash
        ,iroquois_z2_cash
        ,socal_cg_cash
        ,pge_cg_cash
        ,cig_cash
    FROM ice_python_v1_2025_dec_15.staging_v1_ice_next_day_gas_daily
    WHERE (${gasDayRanges})
),

BALMO AS (
    SELECT
        gas_day
        ,hh_balmo
        ,transco_st85_balmo
        ,pine_prarie_balmo
        ,houston_ship_channel_balmo
        ,waha_balmo
        ,ngpl_txok_balmo
        ,transco_zone_5_south_balmo
        ,tetco_m3_balmo
        ,agt_balmo
        ,iroquois_z2_balmo
        ,socal_cg_balmo
        ,pge_cg_balmo
        ,cig_balmo
    FROM ice_python_v1_2025_dec_15.marts_v1_ice_balmo
    WHERE (${gasDayRanges})
),

FINAL AS (
    SELECT
        wsi.date AS gas_day
        ,wsi.year
        ,wsi.month
        ,wsi.day_of_week

        ,conus_gas_hdd
        ,conus_normals_gas_hdd
        ,(conus_gas_hdd - conus_normals_gas_hdd) AS conus_dfn

        ,east_gas_hdd
        ,east_normals_gas_hdd
        ,(east_gas_hdd - east_normals_gas_hdd) AS east_dfn

        ,midwest_gas_hdd
        ,midwest_normals_gas_hdd
        ,(midwest_gas_hdd - midwest_normals_gas_hdd) AS midwest_dfn

        ,mountain_gas_hdd
        ,mountain_normals_gas_hdd
        ,(mountain_gas_hdd - mountain_normals_gas_hdd) AS mountain_dfn

        ,pacific_gas_hdd
        ,pacific_normals_gas_hdd
        ,(pacific_gas_hdd - pacific_normals_gas_hdd) AS pacific_dfn

        ,southcentral_gas_hdd
        ,southcentral_normals_gas_hdd
        ,(southcentral_gas_hdd - southcentral_normals_gas_hdd) AS southcentral_dfn

        ,ndg.hh_cash, b.hh_balmo, (ndg.hh_cash - b.hh_balmo) AS hh_cash_balmo
        ,ndg.transco_st85_cash, b.transco_st85_balmo, (ndg.transco_st85_cash - b.transco_st85_balmo) AS transco_st85_cash_balmo
        ,ndg.pine_prarie_cash, b.pine_prarie_balmo, (ndg.pine_prarie_cash - b.pine_prarie_balmo) AS pine_prarie_cash_balmo
        ,ndg.waha_cash, b.waha_balmo, (ndg.waha_cash - b.waha_balmo) AS waha_cash_balmo
        ,ndg.houston_ship_channel_cash, b.houston_ship_channel_balmo, (ndg.houston_ship_channel_cash - b.houston_ship_channel_balmo) AS houston_ship_channel_cash_balmo
        ,ndg.ngpl_txok_cash, b.ngpl_txok_balmo, (ndg.ngpl_txok_cash - b.ngpl_txok_balmo) AS ngpl_txok_cash_balmo
        ,ndg.transco_zone_5_south_cash, b.transco_zone_5_south_balmo, (ndg.transco_zone_5_south_cash - b.transco_zone_5_south_balmo) AS transco_zone_5_south_cash_balmo
        ,ndg.tetco_m3_cash, b.tetco_m3_balmo, (ndg.tetco_m3_cash - b.tetco_m3_balmo) AS tetco_m3_cash_balmo
        ,ndg.agt_cash, b.agt_balmo, (ndg.agt_cash - b.agt_balmo) AS agt_cash_balmo
        ,ndg.iroquois_z2_cash, b.iroquois_z2_balmo, (ndg.iroquois_z2_cash - b.iroquois_z2_balmo) AS iroquois_z2_cash_balmo
        ,ndg.socal_cg_cash, b.socal_cg_balmo, (ndg.socal_cg_cash - b.socal_cg_balmo) AS socal_cg_cash_balmo
        ,ndg.pge_cg_cash, b.pge_cg_balmo, (ndg.pge_cg_cash - b.pge_cg_balmo) AS pge_cg_cash_balmo
        ,ndg.cig_cash, b.cig_balmo, (ndg.cig_cash - b.cig_balmo) AS cig_cash_balmo

    FROM DAILY_WDD_PIVOT wsi
    LEFT JOIN NEXT_DAY_GAS ndg ON wsi.date = ndg.gas_day
    LEFT JOIN BALMO b ON wsi.date = b.gas_day
)
SELECT * FROM FINAL
ORDER BY year DESC, gas_day ASC
`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const monthRaw = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1), 10);
  const month = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : new Date().getMonth() + 1;

  const startYearRaw = parseInt(searchParams.get("startYear") || "2020", 10);
  const startYear = startYearRaw >= 2015 && startYearRaw <= 2030 ? startYearRaw : 2020;
  const cacheKey = `${month}:${startYear}`;

  const cached = routeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(
      { rows: cached.rows, month, startYear },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
          "X-Route-Cache": "HIT",
        },
      }
    );
  }

  try {
    const sql = buildSQL(month, startYear);
    const result = await query(sql, []);
    routeCache.set(cacheKey, {
      rows: result.rows,
      expiresAt: Date.now() + RESPONSE_TTL_MS,
    });

    return NextResponse.json(
      { rows: result.rows, month, startYear },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
          "X-Route-Cache": "MISS",
        },
      }
    );
  } catch (error) {
    console.error("[ice-wx-cash-balmo] DB query failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch weather-adjusted cash-balmo data" },
      { status: 500 }
    );
  }
}
