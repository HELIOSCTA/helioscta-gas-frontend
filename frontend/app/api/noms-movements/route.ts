import { NextResponse } from "next/server";
import { mssqlQuery } from "@/lib/mssql";

export const dynamic = "force-dynamic";

const TABLE = "noms_v1_2026_jan_02.source_v1_genscape_noms";

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

interface MetaRow {
  pipeline_id: number;
  pipeline_name: string;
  pipeline_short_name: string;
  tariff_zone: string | null;
  tz_id: number | null;
  state: string | null;
  county: string | null;
  loc_name: string;
  location_id: number;
  location_role_id: number;
  facility: string | null;
  role: string | null;
  role_code: string | null;
  interconnecting_entity: string | null;
  interconnecting_pipeline_short_name: string | null;
  meter: string | null;
  drn: string | null;
  latitude: number | null;
  longitude: number | null;
  sign: number | null;
  cycle_code: string | null;
  cycle_name: string | null;
  units: string | null;
  pipeline_balance_flag: number | null;
  storage_flag: number | null;
}

interface MetricsRow extends MetaRow {
  latest_nom: number;
  avg1d: number | null;
  avg7d: number | null;
  delta1d: number | null;
  delta7d: number | null;
  sparkline_csv: string | null;
}

export interface LocationData {
  locationRoleId: number;
  locName: string;
  latestNom: number;
  avg1d: number | null;
  avg7d: number | null;
  delta1d: number | null;
  delta7d: number | null;
  sparkline: number[];
  metadata: Record<string, unknown>;
}

export interface PipelineGroup {
  pipelineShortName: string;
  pipelineName: string;
  pipelineId: number;
  regions: string[];
  latestDay: string;
  summaryLatest: number;
  summaryDelta1d: number | null;
  summaryDelta7d: number | null;
  locations: LocationData[];
}

function parseSparkline(csv: string | null, fallback: number): number[] {
  if (!csv) return [Math.round(fallback)];
  const parsed = csv
    .split(",")
    .map((part) => Number(part))
    .filter((v) => Number.isFinite(v))
    .map((v) => Math.round(v));
  return parsed.length > 0 ? parsed : [Math.round(fallback)];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const thresholdRaw = Number.parseFloat(searchParams.get("threshold") ?? "0");
    const threshold = Number.isFinite(thresholdRaw) && thresholdRaw >= 0 ? thresholdRaw : 0;
    const pipelineParam = searchParams.get("pipeline") ?? "";
    const selectedPipelines = pipelineParam
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    const [{ max_day }] = await mssqlQuery<{ max_day: string }>(
      `SELECT CONVERT(varchar(10), MAX(gas_day), 120) AS max_day FROM ${TABLE}`
    );

    if (!max_day) {
      return NextResponse.json(
        { pipelines: [], latestDay: null },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
      );
    }

    const cutoff = new Date(max_day);
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const queryParams: Record<string, unknown> = {
      cutoff: cutoffStr,
      maxDay: max_day,
    };
    const pipelineFilterSql =
      selectedPipelines.length > 0
        ? `AND pipeline_short_name IN (${addInClause("pl", selectedPipelines, queryParams)})`
        : "";

    const metricsSql = `
      WITH daily AS (
        SELECT
          location_role_id,
          pipeline_short_name,
          pipeline_name,
          pipeline_id,
          loc_name,
          CAST(gas_day AS DATE) AS gas_day,
          SUM(scheduled_cap) AS total_nom
        FROM ${TABLE}
        WHERE gas_day >= @cutoff
          AND gas_day < DATEADD(day, 1, CAST(@maxDay AS DATE))
          ${pipelineFilterSql}
        GROUP BY
          location_role_id,
          pipeline_short_name,
          pipeline_name,
          pipeline_id,
          loc_name,
          CAST(gas_day AS DATE)
      ),
      metrics AS (
        SELECT
          d.location_role_id,
          d.pipeline_short_name,
          d.pipeline_name,
          d.pipeline_id,
          d.loc_name,
          d.gas_day,
          d.total_nom,
          ROW_NUMBER() OVER (PARTITION BY d.location_role_id ORDER BY d.gas_day DESC) AS rn,
          AVG(CAST(d.total_nom AS FLOAT)) OVER (
            PARTITION BY d.location_role_id
            ORDER BY d.gas_day DESC
            ROWS BETWEEN 1 FOLLOWING AND 1 FOLLOWING
          ) AS avg1d,
          AVG(CAST(d.total_nom AS FLOAT)) OVER (
            PARTITION BY d.location_role_id
            ORDER BY d.gas_day DESC
            ROWS BETWEEN 1 FOLLOWING AND 7 FOLLOWING
          ) AS avg7d
        FROM daily d
      ),
      sparkline_source AS (
        SELECT
          d.location_role_id,
          d.gas_day,
          d.total_nom,
          ROW_NUMBER() OVER (PARTITION BY d.location_role_id ORDER BY d.gas_day DESC) AS rn
        FROM daily d
      ),
      sparklines AS (
        SELECT
          s.location_role_id,
          STRING_AGG(CAST(s.total_nom AS VARCHAR(32)), ',') WITHIN GROUP (ORDER BY s.gas_day ASC) AS sparkline_csv
        FROM sparkline_source s
        WHERE s.rn <= 7
        GROUP BY s.location_role_id
      ),
      meta AS (
        SELECT t.*
        FROM (
          SELECT
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
            ROW_NUMBER() OVER (PARTITION BY location_role_id ORDER BY scheduled_cap DESC) AS rn
          FROM ${TABLE}
          WHERE gas_day >= @maxDay
            AND gas_day < DATEADD(day, 1, CAST(@maxDay AS DATE))
            ${pipelineFilterSql}
        ) t
        WHERE t.rn = 1
      )
      SELECT
        m.location_role_id,
        m.pipeline_short_name,
        m.pipeline_name,
        m.pipeline_id,
        m.loc_name,
        m.total_nom AS latest_nom,
        m.avg1d,
        m.avg7d,
        CASE
          WHEN m.avg1d IS NULL THEN NULL
          ELSE m.total_nom - m.avg1d
        END AS delta1d,
        CASE
          WHEN m.avg7d IS NULL THEN NULL
          ELSE m.total_nom - m.avg7d
        END AS delta7d,
        s.sparkline_csv,
        meta.tariff_zone,
        meta.tz_id,
        meta.state,
        meta.county,
        meta.location_id,
        meta.facility,
        meta.role,
        meta.role_code,
        meta.interconnecting_entity,
        meta.interconnecting_pipeline_short_name,
        meta.meter,
        meta.drn,
        meta.latitude,
        meta.longitude,
        meta.sign,
        meta.cycle_code,
        meta.cycle_name,
        meta.units,
        meta.pipeline_balance_flag,
        meta.storage_flag
      FROM metrics m
      LEFT JOIN sparklines s ON s.location_role_id = m.location_role_id
      LEFT JOIN meta ON meta.location_role_id = m.location_role_id
      WHERE m.rn = 1
      ORDER BY m.pipeline_short_name, ABS(m.total_nom) DESC
    `;

    const metricRows = await mssqlQuery<MetricsRow>(metricsSql, queryParams);

    const filteredMetricRows =
      threshold > 0
        ? metricRows.filter((row) => {
            const absDelta1d = Math.abs(row.delta1d ?? 0);
            const absDelta7d = Math.abs(row.delta7d ?? 0);
            return absDelta1d >= threshold || absDelta7d >= threshold;
          })
        : metricRows;

    if (filteredMetricRows.length === 0) {
      return NextResponse.json(
        { pipelines: [], latestDay: max_day, threshold },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
      );
    }

    interface LocResult {
      pipeline: string;
      pipelineName: string;
      pipelineId: number;
      data: LocationData;
    }

    const locResults: LocResult[] = filteredMetricRows.map((row) => {
      const metadataObj: Record<string, unknown> = {
        pipeline_id: row.pipeline_id,
        pipeline_name: row.pipeline_name,
        pipeline_short_name: row.pipeline_short_name,
        tariff_zone: row.tariff_zone,
        tz_id: row.tz_id,
        state: row.state,
        county: row.county,
        loc_name: row.loc_name,
        location_id: row.location_id,
        location_role_id: row.location_role_id,
        facility: row.facility,
        role: row.role,
        role_code: row.role_code,
        interconnecting_entity: row.interconnecting_entity,
        interconnecting_pipeline_short_name: row.interconnecting_pipeline_short_name,
        meter: row.meter,
        drn: row.drn,
        latitude: row.latitude,
        longitude: row.longitude,
        sign: row.sign,
        cycle_code: row.cycle_code,
        cycle_name: row.cycle_name,
        units: row.units,
        pipeline_balance_flag: row.pipeline_balance_flag,
        storage_flag: row.storage_flag,
      };

      return {
        pipeline: row.pipeline_short_name,
        pipelineName: row.pipeline_name,
        pipelineId: row.pipeline_id,
        data: {
          locationRoleId: row.location_role_id,
          locName: row.loc_name,
          latestNom: Math.round(row.latest_nom),
          avg1d: row.avg1d !== null ? Math.round(row.avg1d) : null,
          avg7d: row.avg7d !== null ? Math.round(row.avg7d) : null,
          delta1d: row.delta1d !== null ? Math.round(row.delta1d) : null,
          delta7d: row.delta7d !== null ? Math.round(row.delta7d) : null,
          sparkline: parseSparkline(row.sparkline_csv, row.latest_nom),
          metadata: metadataObj,
        },
      };
    });

    const pipelineMap = new Map<string, LocResult[]>();
    for (const lr of locResults) {
      if (!pipelineMap.has(lr.pipeline)) pipelineMap.set(lr.pipeline, []);
      pipelineMap.get(lr.pipeline)!.push(lr);
    }

    const pipelines: PipelineGroup[] = [];

    for (const [pipelineName, locs] of pipelineMap) {
      locs.sort((a, b) => Math.abs(b.data.latestNom) - Math.abs(a.data.latestNom));

      const first = locs[0];
      const summaryLatest = locs.reduce((s, l) => s + l.data.latestNom, 0);
      const summaryDelta1d = locs.every((l) => l.data.delta1d !== null)
        ? locs.reduce((s, l) => s + (l.data.delta1d ?? 0), 0)
        : null;
      const summaryDelta7d = locs.every((l) => l.data.delta7d !== null)
        ? locs.reduce((s, l) => s + (l.data.delta7d ?? 0), 0)
        : null;

      const regions = [...new Set(locs.map((l) => l.data.locName))];

      pipelines.push({
        pipelineShortName: pipelineName,
        pipelineName: first.pipelineName,
        pipelineId: first.pipelineId,
        regions,
        latestDay: max_day,
        summaryLatest,
        summaryDelta1d,
        summaryDelta7d,
        locations: locs.map((l) => l.data),
      });
    }

    pipelines.sort((a, b) => Math.abs(b.summaryLatest) - Math.abs(a.summaryLatest));

    return NextResponse.json(
      { pipelines, latestDay: max_day, threshold },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      }
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[noms-movements] DB query failed:", err.message, err.stack);
    return NextResponse.json(
      { error: "Failed to fetch nomination movement data", detail: err.message },
      { status: 500 }
    );
  }
}
