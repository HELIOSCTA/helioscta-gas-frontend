import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5 * 60 * 1000;
const RESPONSE_CACHE = new Map<string, { expiresAt: number; payload: unknown }>();

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface HubConfig {
  label: string;
  futuresRoot: string;
  cashColumn: string;
  balmoColumn: string;
  isBasis: boolean;
}

const HUBS: Record<string, HubConfig> = {
  hh: {
    label: "Henry Hub",
    futuresRoot: "HNG",
    cashColumn: "hh_cash",
    balmoColumn: "hh_balmo",
    isBasis: false,
  },
  transco_st85: {
    label: "Transco ST85",
    futuresRoot: "TRZ",
    cashColumn: "transco_st85_cash",
    balmoColumn: "transco_st85_balmo",
    isBasis: true,
  },
  waha: {
    label: "Waha",
    futuresRoot: "WAH",
    cashColumn: "waha_cash",
    balmoColumn: "waha_balmo",
    isBasis: true,
  },
  transco_z5s: {
    label: "Transco Z5S",
    futuresRoot: "T5B",
    cashColumn: "transco_zone_5_south_cash",
    balmoColumn: "transco_zone_5_south_balmo",
    isBasis: true,
  },
  tetco_m3: {
    label: "Tetco M3",
    futuresRoot: "TMT",
    cashColumn: "tetco_m3_cash",
    balmoColumn: "tetco_m3_balmo",
    isBasis: true,
  },
  agt: {
    label: "AGT",
    futuresRoot: "ALQ",
    cashColumn: "agt_cash",
    balmoColumn: "agt_balmo",
    isBasis: true,
  },
  iroquois_z2: {
    label: "Iroquois Z2",
    futuresRoot: "IZB",
    cashColumn: "iroquois_z2_cash",
    balmoColumn: "iroquois_z2_balmo",
    isBasis: true,
  },
  socal_cg: {
    label: "Socal CG",
    futuresRoot: "SCB",
    cashColumn: "socal_cg_cash",
    balmoColumn: "socal_cg_balmo",
    isBasis: true,
  },
  pge_cg: {
    label: "PG&E CG",
    futuresRoot: "PGE",
    cashColumn: "pge_cg_cash",
    balmoColumn: "pge_cg_balmo",
    isBasis: true,
  },
  cig: {
    label: "CIG",
    futuresRoot: "CRI",
    cashColumn: "cig_cash",
    balmoColumn: "cig_balmo",
    isBasis: true,
  },
};

const HUB_KEYS = Object.keys(HUBS);

interface MatrixStripColumn {
  promptOffset: number;
  contractCode: string;
  label: string;
}

interface MatrixRow {
  rowKey: string;
  label: string;
  cash: number | null;
  balmo: number | null;
  futures: Array<number | null>;
}

interface MatrixAverages {
  cash: number | null;
  balmo: number | null;
  futures: Array<number | null>;
}

interface MatrixSection {
  key: string;
  title: string;
  rowLabel: "date" | "year";
  rows: MatrixRow[];
  averages: MatrixAverages;
}

interface HubMatrixPayload {
  hub: string;
  hubLabel: string;
  isBasis: boolean;
  rows: MatrixRow[];
  strip: MatrixStripColumn[];
  sections: MatrixSection[];
  dailyCashByMonthYear: Record<string, DailyCashPoint[]>;
}

interface RawMatrixRow {
  trade_date: string | Date;
  trade_year: number;
  trade_month: number;
  prompt_contract_code: string | null;
  prompt_offset: number;
  contract_code: string | null;
  contract_label: string | null;
  root_symbol: string | null;
  settlement: number | null;
  [key: string]: unknown;
}

interface SharedTradePoint {
  tradeDate: string;
  tradeYear: number;
  tradeMonth: number;
  strip: Array<{ contractCode: string; label: string } | null>;
  cashByHub: Record<string, number | null>;
  balmoByHub: Record<string, number | null>;
  settlementsByRoot: Record<string, Array<number | null>>;
}

interface SeasonalAccumulator {
  month: number;
  year: number;
  cashSum: number;
  cashCount: number;
  balmoSum: number;
  balmoCount: number;
  futuresSum: number[];
  futuresCount: number[];
}

interface DailyCashPoint {
  date: string;
  cash: number;
  promptContractCode: string | null;
  promptLabel: string | null;
}

const SOURCE_METADATA = {
  canonicalSchemas: ["ice", "ice_cleaned"],
  resolvedSchemas: {
    ice: "ice_python",
    ice_cleaned: "ice_python_cleaned",
  },
  resolvedTables: {
    futuresSettlement: "ice_python.future_contracts_v1_2025_dec_16",
    nextDayGasRaw: "ice_python.next_day_gas_v1_2025_dec_16",
    balmoRaw: "ice_python.balmo_v1_2025_dec_16",
    nextDayGasDaily: "ice_python_cleaned.ice_python_next_day_gas_daily (fallback only)",
    balmoDaily: "ice_python_cleaned.ice_python_balmo (fallback only)",
    nymexTradingDays: "dbt.source_v1_nymex_ng_expiration_dates_daily",
    promptCodes: "derived from prompt_contract_code + prompt_offset in SQL",
  },
};

function buildSQL(): string {
  return `
WITH trading_days AS (
    SELECT
        trade_date,
        EXTRACT(YEAR FROM trade_date)::int AS trade_year,
        EXTRACT(MONTH FROM trade_date)::int AS trade_month,
        prompt_contract_code
    FROM dbt.source_v1_nymex_ng_expiration_dates_daily
    WHERE is_weekend = 0
      AND is_nerc_holiday = 0
      AND prompt_contract_code IS NOT NULL
      AND LENGTH(prompt_contract_code) >= 2
      AND LEFT(prompt_contract_code, 1) IN ('F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z')
      AND trade_date >= $1::date
      AND trade_date <= LEAST($2::date, (CURRENT_TIMESTAMP AT TIME ZONE 'MST')::date)
),
strip AS (
    SELECT
        td.trade_date,
        td.trade_year,
        td.trade_month,
        td.prompt_contract_code,
        gs.prompt_offset,
        (
          CASE EXTRACT(MONTH FROM (base_month + (gs.prompt_offset || ' months')::interval))::int
            WHEN 1 THEN 'F'
            WHEN 2 THEN 'G'
            WHEN 3 THEN 'H'
            WHEN 4 THEN 'J'
            WHEN 5 THEN 'K'
            WHEN 6 THEN 'M'
            WHEN 7 THEN 'N'
            WHEN 8 THEN 'Q'
            WHEN 9 THEN 'U'
            WHEN 10 THEN 'V'
            WHEN 11 THEN 'X'
            WHEN 12 THEN 'Z'
          END
        )
        || LPAD((EXTRACT(YEAR FROM (base_month + (gs.prompt_offset || ' months')::interval))::int % 100)::text, 2, '0')
        AS contract_code,
        TO_CHAR((base_month + (gs.prompt_offset || ' months')::interval)::date, 'Mon-YY') AS contract_label
    FROM trading_days td
    JOIN LATERAL (
      SELECT MAKE_DATE(
        2000 + RIGHT(td.prompt_contract_code, 2)::int,
        CASE LEFT(td.prompt_contract_code, 1)
          WHEN 'F' THEN 1
          WHEN 'G' THEN 2
          WHEN 'H' THEN 3
          WHEN 'J' THEN 4
          WHEN 'K' THEN 5
          WHEN 'M' THEN 6
          WHEN 'N' THEN 7
          WHEN 'Q' THEN 8
          WHEN 'U' THEN 9
          WHEN 'V' THEN 10
          WHEN 'X' THEN 11
          WHEN 'Z' THEN 12
        END,
        1
      ) AS base_month
    ) base ON TRUE
    CROSS JOIN generate_series(0, 11) AS gs(prompt_offset)
),
futures AS (
    SELECT
        fc.trade_date,
        SPLIT_PART(fc.symbol, ' ', 1) AS root_symbol,
        SPLIT_PART(SPLIT_PART(fc.symbol, ' ', 2), '-', 1) AS contract_code,
        AVG(fc.value) AS settlement
    FROM ice_python.future_contracts_v1_2025_dec_16 fc
    WHERE fc.trade_date >= $1::date
      AND fc.trade_date <= LEAST($2::date, (CURRENT_TIMESTAMP AT TIME ZONE 'MST')::date)
      AND fc.data_type = 'Settlement'
      AND fc.symbol LIKE ANY($3::text[])
    GROUP BY 1, 2, 3
),
cash_prices AS (
    SELECT
        trade_date,
        AVG(CASE WHEN symbol = 'XGF D1-IPG' THEN value END) AS hh_cash,
        AVG(CASE WHEN symbol = 'XVA D1-IPG' THEN value END) AS transco_st85_cash,
        AVG(CASE WHEN symbol = 'XT6 D1-IPG' THEN value END) AS waha_cash,
        AVG(CASE WHEN symbol = 'YFF D1-IPG' THEN value END) AS transco_zone_5_south_cash,
        AVG(CASE WHEN symbol = 'XZR D1-IPG' THEN value END) AS tetco_m3_cash,
        AVG(CASE WHEN symbol = 'X7F D1-IPG' THEN value END) AS agt_cash,
        AVG(CASE WHEN symbol = 'YP8 D1-IPG' THEN value END) AS iroquois_z2_cash,
        AVG(CASE WHEN symbol = 'XKF D1-IPG' THEN value END) AS socal_cg_cash,
        AVG(CASE WHEN symbol = 'XGV D1-IPG' THEN value END) AS pge_cg_cash,
        AVG(CASE WHEN symbol = 'YKL D1-IPG' THEN value END) AS cig_cash
    FROM ice_python.next_day_gas_v1_2025_dec_16
    WHERE trade_date >= $1::date
      AND trade_date <= LEAST($2::date, (CURRENT_TIMESTAMP AT TIME ZONE 'MST')::date)
      AND symbol IN (
        'XGF D1-IPG', 'XVA D1-IPG', 'XT6 D1-IPG', 'YFF D1-IPG', 'XZR D1-IPG',
        'X7F D1-IPG', 'YP8 D1-IPG', 'XKF D1-IPG', 'XGV D1-IPG', 'YKL D1-IPG'
      )
    GROUP BY trade_date
),
balmo_prices AS (
    SELECT
        trade_date,
        AVG(CASE WHEN symbol = 'HHD B0-IUS' THEN value END) AS hh_balmo,
        AVG(CASE WHEN symbol = 'TRW B0-IUS' THEN value END) AS transco_st85_balmo,
        AVG(CASE WHEN symbol = 'WAS B0-IUS' THEN value END) AS waha_balmo,
        AVG(CASE WHEN symbol = 'T5C B0-IUS' THEN value END) AS transco_zone_5_south_balmo,
        AVG(CASE WHEN symbol = 'TSS B0-IUS' THEN value END) AS tetco_m3_balmo,
        AVG(CASE WHEN symbol = 'ALS B0-IUS' THEN value END) AS agt_balmo,
        AVG(CASE WHEN symbol = 'IZS B0-IUS' THEN value END) AS iroquois_z2_balmo,
        AVG(CASE WHEN symbol = 'SCS B0-IUS' THEN value END) AS socal_cg_balmo,
        AVG(CASE WHEN symbol = 'PIG B0-IUS' THEN value END) AS pge_cg_balmo,
        AVG(CASE WHEN symbol = 'CRS B0-IUS' THEN value END) AS cig_balmo
    FROM ice_python.balmo_v1_2025_dec_16
    WHERE trade_date >= $1::date
      AND trade_date <= LEAST($2::date, (CURRENT_TIMESTAMP AT TIME ZONE 'MST')::date)
      AND symbol IN (
        'HHD B0-IUS', 'TRW B0-IUS', 'WAS B0-IUS', 'T5C B0-IUS', 'TSS B0-IUS',
        'ALS B0-IUS', 'IZS B0-IUS', 'SCS B0-IUS', 'PIG B0-IUS', 'CRS B0-IUS'
      )
    GROUP BY trade_date
),
daily_prices AS (
    SELECT
        COALESCE(c.trade_date, b.trade_date) AS trade_date,
        c.hh_cash,
        c.transco_st85_cash,
        c.waha_cash,
        c.transco_zone_5_south_cash,
        c.tetco_m3_cash,
        c.agt_cash,
        c.iroquois_z2_cash,
        c.socal_cg_cash,
        c.pge_cg_cash,
        c.cig_cash,
        b.hh_balmo,
        b.transco_st85_balmo,
        b.waha_balmo,
        b.transco_zone_5_south_balmo,
        b.tetco_m3_balmo,
        b.agt_balmo,
        b.iroquois_z2_balmo,
        b.socal_cg_balmo,
        b.pge_cg_balmo,
        b.cig_balmo
    FROM cash_prices c
    FULL OUTER JOIN balmo_prices b
      ON b.trade_date = c.trade_date
)
SELECT
    s.trade_date,
    s.trade_year,
    s.trade_month,
    s.prompt_contract_code,
    s.prompt_offset,
    s.contract_code,
    s.contract_label,
    f.root_symbol,
    f.settlement,
    p.hh_cash,
    p.transco_st85_cash,
    p.waha_cash,
    p.transco_zone_5_south_cash,
    p.tetco_m3_cash,
    p.agt_cash,
    p.iroquois_z2_cash,
    p.socal_cg_cash,
    p.pge_cg_cash,
    p.cig_cash,
    p.hh_balmo,
    p.transco_st85_balmo,
    p.waha_balmo,
    p.transco_zone_5_south_balmo,
    p.tetco_m3_balmo,
    p.agt_balmo,
    p.iroquois_z2_balmo,
    p.socal_cg_balmo,
    p.pge_cg_balmo,
    p.cig_balmo
FROM strip s
LEFT JOIN futures f
  ON f.trade_date = s.trade_date
 AND f.contract_code = s.contract_code
LEFT JOIN daily_prices p
  ON p.trade_date = s.trade_date
ORDER BY s.trade_date DESC, s.prompt_offset ASC, f.root_symbol ASC
`;
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateKey(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (value.length >= 10) {
    return value.slice(0, 10);
  }
  return new Date(value).toISOString().slice(0, 10);
}

function computeAverages(rows: MatrixRow[]): MatrixAverages {
  const futuresSum = Array<number>(12).fill(0);
  const futuresCount = Array<number>(12).fill(0);
  let cashSum = 0;
  let cashCount = 0;
  let balmoSum = 0;
  let balmoCount = 0;

  for (const row of rows) {
    if (row.cash !== null) {
      cashSum += row.cash;
      cashCount += 1;
    }
    if (row.balmo !== null) {
      balmoSum += row.balmo;
      balmoCount += 1;
    }

    for (let offset = 0; offset < 12; offset += 1) {
      const value = row.futures[offset];
      if (value !== null) {
        futuresSum[offset] += value;
        futuresCount[offset] += 1;
      }
    }
  }

  return {
    cash: cashCount > 0 ? cashSum / cashCount : null,
    balmo: balmoCount > 0 ? balmoSum / balmoCount : null,
    futures: futuresSum.map((sum, offset) =>
      futuresCount[offset] > 0 ? sum / futuresCount[offset] : null
    ),
  };
}

function buildSharedPoints(rows: RawMatrixRow[]): SharedTradePoint[] {
  const points = new Map<string, SharedTradePoint>();

  for (const row of rows) {
    const tradeDate = toDateKey(row.trade_date);
    const promptOffset = Number(row.prompt_offset);
    if (!Number.isInteger(promptOffset) || promptOffset < 0 || promptOffset > 11) {
      continue;
    }

    let point = points.get(tradeDate);
    if (!point) {
      point = {
        tradeDate,
        tradeYear: Number(row.trade_year),
        tradeMonth: Number(row.trade_month),
        strip: Array<{ contractCode: string; label: string } | null>(12).fill(null),
        cashByHub: Object.fromEntries(HUB_KEYS.map((key) => [key, null])) as Record<
          string,
          number | null
        >,
        balmoByHub: Object.fromEntries(HUB_KEYS.map((key) => [key, null])) as Record<
          string,
          number | null
        >,
        settlementsByRoot: {},
      };
      points.set(tradeDate, point);
    }

    const contractCode = row.contract_code ?? null;
    const contractLabel = row.contract_label ?? contractCode;
    if (contractCode && contractLabel) {
      point.strip[promptOffset] = { contractCode, label: contractLabel };
    }

    for (const hubKey of HUB_KEYS) {
      const hub = HUBS[hubKey];
      const cash = toFiniteNumber(row[hub.cashColumn]);
      const balmo = toFiniteNumber(row[hub.balmoColumn]);
      if (cash !== null) {
        point.cashByHub[hubKey] = cash;
      }
      if (balmo !== null) {
        point.balmoByHub[hubKey] = balmo;
      }
    }

    const root = typeof row.root_symbol === "string" ? row.root_symbol : null;
    const settlement = toFiniteNumber(row.settlement);
    if (root && settlement !== null) {
      if (!point.settlementsByRoot[root]) {
        point.settlementsByRoot[root] = Array<number | null>(12).fill(null);
      }
      point.settlementsByRoot[root][promptOffset] = settlement;
    }
  }

  return [...points.values()].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
}

function buildHubPayload(
  sharedPoints: SharedTradePoint[],
  hubKey: string,
  month: number,
  year: number,
  seasonalYears: number,
  includeSeasonal: boolean
): HubMatrixPayload {
  const hub = HUBS[hubKey];
  const currentRowsByDate = new Map<string, MatrixRow>();
  const seasonalByMonthYear = new Map<string, SeasonalAccumulator>();
  const dailyCashByMonthYear = new Map<string, DailyCashPoint[]>();
  const stripByOffset = new Map<
    number,
    { contractCode: string; label: string; tradeDate: string }
  >();
  const fallbackStripByOffset = new Map<number, { contractCode: string; label: string }>();

  for (const point of sharedPoints) {
    const hhStrip = point.settlementsByRoot.HNG ?? Array<number | null>(12).fill(null);
    const basisStrip = point.settlementsByRoot[hub.futuresRoot] ?? Array<number | null>(12).fill(null);

    const outrightStrip = hhStrip.map((hhValue, offset) => {
      if (hhValue === null) {
        return null;
      }
      if (!hub.isBasis) {
        return hhValue;
      }
      const basisValue = basisStrip[offset] ?? null;
      if (basisValue === null) {
        return null;
      }
      return hhValue + basisValue;
    });

    for (let offset = 0; offset < 12; offset += 1) {
      const stripCell = point.strip[offset];
      if (stripCell && !fallbackStripByOffset.has(offset)) {
        fallbackStripByOffset.set(offset, {
          contractCode: stripCell.contractCode,
          label: stripCell.label,
        });
      }
    }

    const cash = point.cashByHub[hubKey] ?? null;
    const balmo = point.balmoByHub[hubKey] ?? null;

    if (point.tradeMonth === month && point.tradeYear === year) {
      for (let offset = 0; offset < 12; offset += 1) {
        const stripCell = point.strip[offset];
        if (!stripCell) {
          continue;
        }
        const existing = stripByOffset.get(offset);
        if (!existing || point.tradeDate < existing.tradeDate) {
          stripByOffset.set(offset, {
            contractCode: stripCell.contractCode,
            label: stripCell.label,
            tradeDate: point.tradeDate,
          });
        }
      }

      currentRowsByDate.set(point.tradeDate, {
        rowKey: point.tradeDate,
        label: point.tradeDate,
        cash,
        balmo,
        futures: outrightStrip,
      });
    }

    const seasonalKey = `${point.tradeMonth}-${point.tradeYear}`;
    let seasonal = seasonalByMonthYear.get(seasonalKey);
    if (!seasonal) {
      seasonal = {
        month: point.tradeMonth,
        year: point.tradeYear,
        cashSum: 0,
        cashCount: 0,
        balmoSum: 0,
        balmoCount: 0,
        futuresSum: Array<number>(12).fill(0),
        futuresCount: Array<number>(12).fill(0),
      };
      seasonalByMonthYear.set(seasonalKey, seasonal);
    }

    if (cash !== null) {
      seasonal.cashSum += cash;
      seasonal.cashCount += 1;

      const monthKey = `${point.tradeYear}-${String(point.tradeMonth).padStart(2, "0")}`;
      const prompt = point.strip[0];
      const dailyRows = dailyCashByMonthYear.get(monthKey) ?? [];
      dailyRows.push({
        date: point.tradeDate,
        cash,
        promptContractCode: prompt?.contractCode ?? null,
        promptLabel: prompt?.label ?? null,
      });
      dailyCashByMonthYear.set(monthKey, dailyRows);
    }
    if (balmo !== null) {
      seasonal.balmoSum += balmo;
      seasonal.balmoCount += 1;
    }

    for (let offset = 0; offset < 12; offset += 1) {
      const value = outrightStrip[offset];
      if (value !== null) {
        seasonal.futuresSum[offset] += value;
        seasonal.futuresCount[offset] += 1;
      }
    }
  }

  const strip: MatrixStripColumn[] = Array.from({ length: 12 }, (_, promptOffset) => {
    const selected = stripByOffset.get(promptOffset);
    const fallback = fallbackStripByOffset.get(promptOffset);
    return {
      promptOffset,
      contractCode: selected?.contractCode ?? fallback?.contractCode ?? `P${promptOffset}`,
      label: selected?.label ?? fallback?.label ?? `P+${promptOffset}`,
    };
  });

  const currentRows = [...currentRowsByDate.values()].sort((a, b) => b.rowKey.localeCompare(a.rowKey));

  const sections: MatrixSection[] = [
    {
      key: "current-month",
      title: "Current Month Cash to Balmo/Futures",
      rowLabel: "date",
      rows: currentRows,
      averages: computeAverages(currentRows),
    },
  ];

  if (includeSeasonal) {
    for (let monthIdx = 1; monthIdx <= 12; monthIdx += 1) {
      const monthRows = [...seasonalByMonthYear.values()]
        .filter((row) => row.month === monthIdx && row.year <= year)
        .sort((a, b) => b.year - a.year)
        .slice(0, seasonalYears)
        .map<MatrixRow>((row) => ({
          rowKey: String(row.year),
          label: String(row.year),
          cash: row.cashCount > 0 ? row.cashSum / row.cashCount : null,
          balmo: row.balmoCount > 0 ? row.balmoSum / row.balmoCount : null,
          futures: row.futuresSum.map((sum, offset) =>
            row.futuresCount[offset] > 0 ? sum / row.futuresCount[offset] : null
          ),
        }));

      if (monthRows.length === 0) {
        continue;
      }

      sections.push({
        key: `seasonal-${monthIdx}`,
        title: `${MONTH_NAMES[monthIdx - 1]} Matrix of Cash against Henry Hub Futures`,
        rowLabel: "year",
        rows: monthRows,
        averages: computeAverages(monthRows),
      });
    }
  }

  return {
    hub: hubKey,
    hubLabel: hub.label,
    isBasis: hub.isBasis,
    rows: currentRows,
    strip,
    sections,
    dailyCashByMonthYear: Object.fromEntries(
      [...dailyCashByMonthYear.entries()].map(([monthKey, points]) => [
        monthKey,
        points.sort((a, b) => a.date.localeCompare(b.date)),
      ])
    ),
  };
}

function cacheHeaders() {
  return {
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const now = new Date();
  const monthRaw = Number.parseInt(searchParams.get("month") || String(now.getMonth() + 1), 10);
  const month = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : now.getMonth() + 1;

  const yearRaw = Number.parseInt(searchParams.get("year") || String(now.getFullYear()), 10);
  const year = yearRaw >= 2020 && yearRaw <= 2030 ? yearRaw : now.getFullYear();

  const seasonalYearsRaw = Number.parseInt(searchParams.get("seasonalYears") || "5", 10);
  const seasonalYears =
    Number.isFinite(seasonalYearsRaw) && seasonalYearsRaw >= 1 && seasonalYearsRaw <= 10
      ? seasonalYearsRaw
      : 5;

  const scope = searchParams.get("scope") === "all" ? "all" : "single";
  const requestedView = searchParams.get("view");
  const view =
    requestedView === "summary" || requestedView === "full"
      ? requestedView
      : scope === "all"
      ? "summary"
      : "full";
  const includeSeasonal = view === "full";
  const requestedHub = searchParams.get("hub") || "hh";

  if (scope === "single" && !HUB_KEYS.includes(requestedHub)) {
    return NextResponse.json({ error: `Invalid hub: ${requestedHub}` }, { status: 400 });
  }

  const cacheKey = `${scope}:${view}:${month}:${year}:${seasonalYears}:${scope === "single" ? requestedHub : "all"}`;
  const cached = RESPONSE_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload, { headers: cacheHeaders() });
  }

  try {
    const monthPadded = String(month).padStart(2, "0");
    const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEnd = `${year}-${monthPadded}-${String(lastDayOfMonth).padStart(2, "0")}`;

    const rangeStartYear = Math.max(2013, year - seasonalYears + 1);
    const startDate = includeSeasonal ? `${rangeStartYear}-01-01` : `${year}-${monthPadded}-01`;
    const endDate = includeSeasonal ? `${year}-12-31` : monthEnd;

    const rootsForQuery =
      scope === "all"
        ? [...new Set(["HNG", ...HUB_KEYS.map((key) => HUBS[key].futuresRoot)])]
        : [...new Set(["HNG", HUBS[requestedHub].futuresRoot])];

    const symbolPatterns = rootsForQuery.map((root) => `${root} %`);

    const result = await query<RawMatrixRow>(buildSQL(), [startDate, endDate, symbolPatterns]);
    const sharedPoints = buildSharedPoints(result.rows);

    const payload =
      scope === "all"
        ? {
            scope: "all" as const,
            view,
            month,
            year,
            seasonalYears,
            hubOrder: HUB_KEYS,
            hubs: Object.fromEntries(
              HUB_KEYS.map((hubKey) => [
                hubKey,
                buildHubPayload(sharedPoints, hubKey, month, year, seasonalYears, includeSeasonal),
              ])
            ) as Record<string, HubMatrixPayload>,
            sourceMetadata: SOURCE_METADATA,
          }
        : (() => {
            const hubPayload = buildHubPayload(
              sharedPoints,
              requestedHub,
              month,
              year,
              seasonalYears,
              includeSeasonal
            );
            return {
              scope: "single" as const,
              view,
              month,
              year,
              seasonalYears,
              hub: hubPayload.hub,
              hubLabel: hubPayload.hubLabel,
              isBasis: hubPayload.isBasis,
              rows: hubPayload.rows,
              strip: hubPayload.strip,
              sections: hubPayload.sections,
              dailyCashByMonthYear: hubPayload.dailyCashByMonthYear,
              sourceMetadata: SOURCE_METADATA,
            };
          })();

    RESPONSE_CACHE.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload,
    });

    return NextResponse.json(payload, { headers: cacheHeaders() });
  } catch (error) {
    console.error("[ice-cash-pricing-matrix] DB query failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch cash pricing matrix data" },
      { status: 500 }
    );
  }
}
