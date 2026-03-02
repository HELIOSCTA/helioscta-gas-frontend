import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Cash Pricing Matrix — for a selected hub, returns the 12-month futures strip
 * (prompt + 11 forward months) as outright prices for each trading day of
 * the selected month.
 *
 * Params: ?month=3&year=2026&hub=hh
 *
 * For HH: outright = HNG settlement
 * For non-HH: outright = HNG settlement + basis settlement (e.g. TRZ + HNG)
 *
 * Returns unpivoted futures + per-day cash/balmo. Frontend pivots.
 */

interface HubConfig {
  label: string;
  futuresSymbol: string;
  cashSymbol: string;
  balmoSymbol: string;
  isBasis: boolean; // true = non-HH basis contract, outright = hh + basis
}

const HUBS: Record<string, HubConfig> = {
  hh: { label: "Henry Hub", futuresSymbol: "HNG", cashSymbol: "XGF D1-IPG", balmoSymbol: "HHD B0-IUS", isBasis: false },
  transco_st85: { label: "Transco ST85", futuresSymbol: "TRZ", cashSymbol: "XVA D1-IPG", balmoSymbol: "TRW B0-IUS", isBasis: true },
  waha: { label: "Waha", futuresSymbol: "WAH", cashSymbol: "XT6 D1-IPG", balmoSymbol: "WAS B0-IUS", isBasis: true },
  transco_z5s: { label: "Transco Z5S", futuresSymbol: "T5B", cashSymbol: "YFF D1-IPG", balmoSymbol: "T5C B0-IUS", isBasis: true },
  tetco_m3: { label: "Tetco M3", futuresSymbol: "TMT", cashSymbol: "XZR D1-IPG", balmoSymbol: "TSS B0-IUS", isBasis: true },
  agt: { label: "AGT", futuresSymbol: "ALQ", cashSymbol: "X7F D1-IPG", balmoSymbol: "ALS B0-IUS", isBasis: true },
  iroquois_z2: { label: "Iroquois Z2", futuresSymbol: "IZB", cashSymbol: "YP8 D1-IPG", balmoSymbol: "IZS B0-IUS", isBasis: true },
  socal_cg: { label: "Socal CG", futuresSymbol: "SCB", cashSymbol: "XKF D1-IPG", balmoSymbol: "SCS B0-IUS", isBasis: true },
  pge_cg: { label: "PG&E CG", futuresSymbol: "PGE", cashSymbol: "XGV D1-IPG", balmoSymbol: "PIG B0-IUS", isBasis: true },
  cig: { label: "CIG", futuresSymbol: "CRI", cashSymbol: "YKL D1-IPG", balmoSymbol: "CRS B0-IUS", isBasis: true },
};

const HUB_KEYS = Object.keys(HUBS);

function buildSQL(month: number, year: number, hub: HubConfig): string {
  const mm = String(month).padStart(2, "0");
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nmm = String(nextMonth).padStart(2, "0");

  // For HH we only need HNG; for basis hubs we need both HNG and the hub symbol
  const symbolFilter = hub.isBasis
    ? `(symbol LIKE '%HNG%' OR symbol LIKE '%${hub.futuresSymbol}%')`
    : `symbol LIKE '%${hub.futuresSymbol}%'`;

  return `
WITH TRADING_DAYS AS (
    SELECT trade_date, prompt_contract_code
    FROM dbt.source_v1_nymex_ng_expiration_dates_daily
    WHERE is_weekend = 0
        AND is_nerc_holiday = 0
        AND trade_date >= '${year}-${mm}-01'
        AND trade_date < '${nextYear}-${nmm}-01'
        AND trade_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'MST')::DATE
),

FUTURES_RAW AS (
    SELECT
        trade_date,
        symbol,
        SPLIT_PART(SPLIT_PART(symbol, ' ', 2), '-', 1) AS contract_code,
        value
    FROM ice_python.future_contracts_v1_2025_dec_16
    WHERE trade_date IN (SELECT trade_date FROM TRADING_DAYS)
        AND ${symbolFilter}
),

FUTURES AS (
    SELECT
        trade_date,
        contract_code,
        AVG(CASE WHEN symbol LIKE '%HNG%' THEN value END) AS hh_value${hub.isBasis ? `,
        AVG(CASE WHEN symbol LIKE '%${hub.futuresSymbol}%' THEN value END) AS basis_value` : ''}
    FROM FUTURES_RAW
    GROUP BY trade_date, contract_code
),

CASH AS (
    SELECT trade_date, AVG(value) AS cash
    FROM ice_python.next_day_gas_v1_2025_dec_16
    WHERE trade_date IN (SELECT trade_date FROM TRADING_DAYS)
        AND symbol = '${hub.cashSymbol}'
    GROUP BY trade_date
),

BALMO AS (
    SELECT trade_date, AVG(value) AS balmo
    FROM ice_python.balmo_v1_2025_dec_16
    WHERE trade_date IN (SELECT trade_date FROM TRADING_DAYS)
        AND symbol = '${hub.balmoSymbol}'
    GROUP BY trade_date
)

SELECT
    t.trade_date,
    t.prompt_contract_code,
    f.contract_code,
    f.hh_value${hub.isBasis ? `,
    f.basis_value` : ''},
    c.cash,
    b.balmo
FROM TRADING_DAYS t
LEFT JOIN FUTURES f ON t.trade_date = f.trade_date
LEFT JOIN CASH c ON t.trade_date = c.trade_date
LEFT JOIN BALMO b ON t.trade_date = b.trade_date
ORDER BY t.trade_date DESC, f.contract_code
`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const now = new Date();
  const monthRaw = parseInt(searchParams.get("month") || String(now.getMonth() + 1), 10);
  const month = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : now.getMonth() + 1;

  const yearRaw = parseInt(searchParams.get("year") || String(now.getFullYear()), 10);
  const year = yearRaw >= 2020 && yearRaw <= 2030 ? yearRaw : now.getFullYear();

  const hubKey = searchParams.get("hub") || "hh";
  if (!HUB_KEYS.includes(hubKey)) {
    return NextResponse.json({ error: `Invalid hub: ${hubKey}` }, { status: 400 });
  }
  const hub = HUBS[hubKey];

  try {
    const sql = buildSQL(month, year, hub);
    const result = await query(sql, []);

    return NextResponse.json(
      { rows: result.rows, month, year, hub: hubKey, isBasis: hub.isBasis },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("[ice-cash-pricing-matrix] DB query failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch cash pricing matrix data" },
      { status: 500 }
    );
  }
}
