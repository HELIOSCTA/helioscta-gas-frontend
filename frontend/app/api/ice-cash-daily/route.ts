import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const SQL = `
SELECT
  COALESCE(c.gas_day, b.gas_day) AS gas_day,

  c.hh_cash, b.hh_balmo, (c.hh_cash - b.hh_balmo) AS hh_cash_balmo,
  c.transco_st85_cash, b.transco_st85_balmo, (c.transco_st85_cash - b.transco_st85_balmo) AS transco_st85_cash_balmo,
  c.pine_prarie_cash, b.pine_prarie_balmo, (c.pine_prarie_cash - b.pine_prarie_balmo) AS pine_prarie_cash_balmo,
  c.houston_ship_channel_cash, b.houston_ship_channel_balmo, (c.houston_ship_channel_cash - b.houston_ship_channel_balmo) AS houston_ship_channel_cash_balmo,
  c.waha_cash, b.waha_balmo, (c.waha_cash - b.waha_balmo) AS waha_cash_balmo,
  c.ngpl_txok_cash, b.ngpl_txok_balmo, (c.ngpl_txok_cash - b.ngpl_txok_balmo) AS ngpl_txok_cash_balmo,
  c.transco_zone_5_south_cash, b.transco_zone_5_south_balmo, (c.transco_zone_5_south_cash - b.transco_zone_5_south_balmo) AS transco_zone_5_south_cash_balmo,
  c.tetco_m3_cash, b.tetco_m3_balmo, (c.tetco_m3_cash - b.tetco_m3_balmo) AS tetco_m3_cash_balmo,
  c.agt_cash, b.agt_balmo, (c.agt_cash - b.agt_balmo) AS agt_cash_balmo,
  c.iroquois_z2_cash, b.iroquois_z2_balmo, (c.iroquois_z2_cash - b.iroquois_z2_balmo) AS iroquois_z2_cash_balmo,
  c.socal_cg_cash, b.socal_cg_balmo, (c.socal_cg_cash - b.socal_cg_balmo) AS socal_cg_cash_balmo,
  c.pge_cg_cash, b.pge_cg_balmo, (c.pge_cg_cash - b.pge_cg_balmo) AS pge_cg_cash_balmo,
  c.cig_cash, b.cig_balmo, (c.cig_cash - b.cig_balmo) AS cig_cash_balmo

FROM ice_python_v1_2025_dec_15.staging_v1_ice_next_day_gas_daily c
FULL OUTER JOIN ice_python_v1_2025_dec_15.marts_v1_ice_balmo b ON c.gas_day = b.gas_day
WHERE COALESCE(c.gas_day, b.gas_day) >= $1::date
  AND COALESCE(c.gas_day, b.gas_day) <= $2::date
ORDER BY COALESCE(c.gas_day, b.gas_day) DESC
`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10);
  const defaultStart = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);

  const startDate = searchParams.get("startDate") || defaultStart;
  const endDate = searchParams.get("endDate") || defaultEnd;

  try {
    const result = await query(SQL, [startDate, endDate]);

    return NextResponse.json(
      { rows: result.rows },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("[ice-cash-daily] DB query failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch ICE cash daily data" },
      { status: 500 }
    );
  }
}
