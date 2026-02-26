import { NextResponse } from "next/server";
import { mssqlQuery } from "@/lib/mssql";

export const dynamic = "force-dynamic";

const TABLE = "noms_v1_2026_jan_02.source_v1_genscape_noms";

function toISODate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Build a parameterized IN clause: returns "(@pl0, @pl1, ...)" */
function addInClause(
  prefix: string,
  values: string[],
  params: Record<string, unknown>
): string {
  return values
    .map((v, i) => {
      const key = `${prefix}${i}`;
      params[key] = v;
      return `@${key}`;
    })
    .join(", ");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startDate = toISODate(searchParams.get("start"));
  const endDate = toISODate(searchParams.get("end"));
  const pipelineParam = searchParams.get("pipeline") || null; // comma-separated
  const locNameParam = searchParams.get("locName") || null; // comma-separated
  const roleIdParam = searchParams.get("locationRoleId") || null; // comma-separated
  const search = searchParams.get("search") || null;
  const limitRaw = parseInt(searchParams.get("limit") || "100", 10);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : 100;
  const offsetRaw = parseInt(searchParams.get("offset") || "0", 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  try {
    const conditions: string[] = [];
    const params: Record<string, unknown> = { limit, offset };

    if (startDate) {
      conditions.push("gas_day >= @startDate");
      params.startDate = startDate;
    }

    if (endDate) {
      conditions.push("gas_day <= @endDate");
      params.endDate = endDate;
    }

    // Multi-pipeline filter
    if (pipelineParam) {
      const list = pipelineParam.split(",").filter(Boolean);
      if (list.length > 0) {
        const inClause = addInClause("pl", list, params);
        conditions.push(`pipeline_short_name IN (${inClause})`);
      }
    }

    // Multi loc_name filter
    if (locNameParam) {
      const list = locNameParam.split(",").filter(Boolean);
      if (list.length > 0) {
        const inClause = addInClause("ln", list, params);
        conditions.push(`loc_name IN (${inClause})`);
      }
    }

    // Multi location_role_id filter
    if (roleIdParam) {
      const list = roleIdParam
        .split(",")
        .map((v) => parseInt(v, 10))
        .filter((v) => Number.isFinite(v));
      if (list.length > 0) {
        const placeholders = list.map((v, i) => {
          const key = `ri${i}`;
          params[key] = v;
          return `@${key}`;
        });
        conditions.push(`location_role_id IN (${placeholders.join(", ")})`);
      }
    }

    if (search) {
      conditions.push(
        "(loc_name LIKE @search OR facility LIKE @search OR interconnecting_entity LIKE @search)"
      );
      params.search = `%${search}%`;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*) as total FROM ${TABLE} ${whereClause}`;

    const dataSql = `
      SELECT
        gas_day,
        pipeline_id,
        pipeline_name,
        pipeline_short_name,
        tariff_zone,
        tz_id,
        state,
        county,
        loc_name,
        location_id,
        location_role_id,
        facility,
        role,
        role_code,
        interconnecting_entity,
        interconnecting_pipeline_short_name,
        meter,
        drn,
        latitude,
        longitude,
        sign,
        cycle_code,
        cycle_name,
        units,
        pipeline_balance_flag,
        storage_flag,
        scheduled_cap,
        signed_scheduled_cap,
        no_notice_capacity,
        operational_cap,
        available_cap,
        design_cap
      FROM ${TABLE}
      ${whereClause}
      ORDER BY gas_day DESC, pipeline_short_name, loc_name
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const [countResult, dataResult] = await Promise.all([
      mssqlQuery<{ total: number }>(countSql, params),
      mssqlQuery(dataSql, params),
    ]);

    return NextResponse.json(
      {
        rows: dataResult,
        total_count: countResult[0]?.total ?? 0,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("[genscape-noms] DB query failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch Genscape nominations data" },
      { status: 500 }
    );
  }
}
