import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const SQL = `
WITH NEXT_DAY_GAS AS (
    SELECT
        trade_date
        ,AVG(CASE WHEN symbol='XGF D1-IPG' THEN value ELSE NULL END) AS hh_cash
        ,AVG(CASE WHEN symbol='XVA D1-IPG' THEN value END) AS transco_st85_cash
        ,AVG(CASE WHEN symbol='YV7 D1-IPG' THEN value END) AS pine_prarie_cash
        ,AVG(CASE WHEN symbol='XT6 D1-IPG' THEN value END) AS waha_cash
        ,AVG(CASE WHEN symbol='YFF D1-IPG' THEN value END) AS transco_zone_5_south_cash
        ,AVG(CASE WHEN symbol='XZR D1-IPG' THEN value END) AS tetco_m3_cash
        ,AVG(CASE WHEN symbol='X7F D1-IPG' THEN value END) AS agt_cash
        ,AVG(CASE WHEN symbol='YP8 D1-IPG' THEN value END) AS iroquois_z2_cash
        ,AVG(CASE WHEN symbol='XKF D1-IPG' THEN value END) AS socal_cg_cash
        ,AVG(CASE WHEN symbol='XGV D1-IPG' THEN value END) AS pge_cg_cash
        ,AVG(CASE WHEN symbol='YKL D1-IPG' THEN value END) AS cig_cash
    FROM ice_python.next_day_gas_v1_2025_dec_16
    GROUP BY trade_date
),
BALMO AS (
    SELECT
        trade_date
        ,AVG(CASE WHEN symbol='HHD B0-IUS' THEN value ELSE NULL END) AS hh_balmo
        ,AVG(CASE WHEN symbol='TRW B0-IUS' THEN value END) AS transco_st85_balmo
        ,AVG(CASE WHEN symbol='CVK B0-IUS' THEN value END) AS pine_prarie_balmo
        ,AVG(CASE WHEN symbol='WAS B0-IUS' THEN value END) AS waha_balmo
        ,AVG(CASE WHEN symbol='T5C B0-IUS' THEN value END) AS transco_zone_5_south_balmo
        ,AVG(CASE WHEN symbol='TSS B0-IUS' THEN value END) AS tetco_m3_balmo
        ,AVG(CASE WHEN symbol='ALS B0-IUS' THEN value END) AS agt_balmo
        ,AVG(CASE WHEN symbol='IZS B0-IUS' THEN value END) AS iroquois_z2_balmo
        ,AVG(CASE WHEN symbol='SCS B0-IUS' THEN value END) AS socal_cg_balmo
        ,AVG(CASE WHEN symbol='PIG B0-IUS' THEN value END) AS pge_cg_balmo
        ,AVG(CASE WHEN symbol='CRS B0-IUS' THEN value END) AS cig_balmo
    FROM ice_python.balmo_v1_2025_dec_16
    GROUP BY trade_date
),
FINAL AS (
    SELECT
        ndg.trade_date

        ,hh_cash
        ,hh_balmo
        ,(hh_cash - hh_balmo) AS hh_cash_balmo

        ,transco_st85_cash
        ,transco_st85_balmo
        ,(transco_st85_cash - transco_st85_balmo) AS transco_st85_cash_balmo
        ,(transco_st85_cash - hh_cash) AS transco_st85_basis

        ,pine_prarie_cash
        ,pine_prarie_balmo
        ,(pine_prarie_cash - pine_prarie_balmo) AS pine_prarie_cash_balmo
        ,(pine_prarie_cash - hh_cash) AS pine_prarie_basis

        ,waha_cash
        ,waha_balmo
        ,(waha_cash - waha_balmo) AS waha_cash_balmo
        ,(waha_cash - hh_cash) AS waha_basis

        ,transco_zone_5_south_cash
        ,transco_zone_5_south_balmo
        ,(transco_zone_5_south_cash - transco_zone_5_south_balmo) AS transco_zone_5_south_cash_balmo
        ,(transco_zone_5_south_cash - hh_cash) AS transco_zone_5_south_basis

        ,tetco_m3_cash
        ,tetco_m3_balmo
        ,(tetco_m3_cash - tetco_m3_balmo) AS tetco_m3_cash_balmo
        ,(tetco_m3_cash - hh_cash) AS tetco_m3_basis

        ,agt_cash
        ,agt_balmo
        ,(agt_cash - agt_balmo) AS agt_cash_balmo
        ,(agt_cash - hh_cash) AS agt_basis

        ,iroquois_z2_cash
        ,iroquois_z2_balmo
        ,(iroquois_z2_cash - iroquois_z2_balmo) AS iroquois_z2_cash_balmo
        ,(iroquois_z2_cash - hh_cash) AS iroquois_z2_basis

        ,socal_cg_cash
        ,socal_cg_balmo
        ,(socal_cg_cash - socal_cg_balmo) AS socal_cg_cash_balmo
        ,(socal_cg_cash - hh_cash) AS socal_cg_basis

        ,pge_cg_cash
        ,pge_cg_balmo
        ,(pge_cg_cash - pge_cg_balmo) AS pge_cg_cash_balmo
        ,(pge_cg_cash - hh_cash) AS pge_cg_basis

        ,cig_cash
        ,cig_balmo
        ,(cig_cash - cig_balmo) AS cig_cash_balmo
        ,(cig_cash - hh_cash) AS cig_basis

    FROM NEXT_DAY_GAS ndg
    LEFT JOIN BALMO b ON ndg.trade_date = b.trade_date
)
SELECT * FROM FINAL
WHERE trade_date >= $1::date AND trade_date <= $2::date
ORDER BY trade_date DESC
`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10);
  const defaultStart = new Date(now.getTime() - 10 * 86_400_000).toISOString().slice(0, 10);

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
    console.error("[ice-cash-balmo] DB query failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch ICE cash-balmo data" },
      { status: 500 }
    );
  }
}
