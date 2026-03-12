import { NextResponse } from "next/server";
import { mssqlQuery } from "@/lib/mssql";

export const dynamic = "force-dynamic";

const TABLE = "noms_v1_2026_jan_02.source_v1_genscape_noms";

/* ── Row shapes ──────────────────────────────────────────────────── */

interface AggRow {
  location_role_id: number;
  pipeline_short_name: string;
  pipeline_name: string;
  pipeline_id: number;
  loc_name: string;
  gas_day: string;
  total_nom: number;
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

/* ── Response shapes ─────────────────────────────────────────────── */

export interface LocationData {
  locationRoleId: number;
  locName: string;
  latestNom: number;
  dod: number | null;
  avg7d: number | null;
  avg30d: number | null;
  delta7d: number | null;
  delta30d: number | null;
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
  summaryDod: number | null;
  summaryDelta7d: number | null;
  summaryDelta30d: number | null;
  locations: LocationData[];
}

export async function GET() {
  try {
    /* Step 1 — get the latest gas_day (very fast, should use index) */
    const [{ max_day }] = await mssqlQuery<{ max_day: string }>(
      `SELECT CONVERT(varchar(10), MAX(gas_day), 120) AS max_day FROM ${TABLE}`
    );

    if (!max_day) {
      return NextResponse.json(
        { pipelines: [], latestDay: null },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
      );
    }

    /* Step 2 — daily aggregates per location_role_id for the last 31 days.
       Use the raw gas_day column in the WHERE so indexes work.
       Include pipeline_short_name, pipeline_name, pipeline_id, loc_name
       in the GROUP BY so we get them without a separate metadata query. */
    const cutoff = new Date(max_day);
    cutoff.setDate(cutoff.getDate() - 31);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const aggSql = `
      SELECT
        location_role_id,
        pipeline_short_name,
        pipeline_name,
        pipeline_id,
        loc_name,
        CONVERT(varchar(10), gas_day, 120) AS gas_day,
        SUM(scheduled_cap) AS total_nom
      FROM ${TABLE}
      WHERE gas_day >= @cutoff
      GROUP BY location_role_id, pipeline_short_name, pipeline_name,
               pipeline_id, loc_name, CONVERT(varchar(10), gas_day, 120)
      ORDER BY pipeline_short_name, location_role_id,
               CONVERT(varchar(10), gas_day, 120) DESC
    `;

    /* Step 3 — metadata for latest day only (one row per location_role_id).
       Filter on gas_day directly (index-friendly). */
    const metaSql = `
      SELECT t.*
      FROM (
        SELECT
          pipeline_id, pipeline_name, pipeline_short_name,
          tariff_zone, tz_id, state, county,
          loc_name, location_id, location_role_id,
          facility, role, role_code,
          interconnecting_entity, interconnecting_pipeline_short_name,
          meter, drn, latitude, longitude, sign,
          cycle_code, cycle_name, units,
          pipeline_balance_flag, storage_flag,
          ROW_NUMBER() OVER (PARTITION BY location_role_id ORDER BY scheduled_cap DESC) AS rn
        FROM ${TABLE}
        WHERE gas_day >= @maxDay AND gas_day < DATEADD(day, 1, CAST(@maxDay AS DATE))
      ) t
      WHERE t.rn = 1
    `;

    const [aggRows, metaRows] = await Promise.all([
      mssqlQuery<AggRow>(aggSql, { cutoff: cutoffStr }),
      mssqlQuery<MetaRow>(metaSql, { maxDay: max_day }),
    ]);

    if (aggRows.length === 0) {
      return NextResponse.json(
        { pipelines: [], latestDay: max_day },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
      );
    }

    /* ── Build lookup maps ───────────────────────────────────────── */

    const metaMap = new Map<number, MetaRow>();
    for (const m of metaRows) metaMap.set(m.location_role_id, m);

    // Group daily data by location_role_id (rows already ordered DESC by gas_day)
    const dailyMap = new Map<
      number,
      { days: { day: string; vol: number }[]; pipeline: string; pipelineName: string; pipelineId: number; locName: string }
    >();

    for (const r of aggRows) {
      let entry = dailyMap.get(r.location_role_id);
      if (!entry) {
        entry = {
          days: [],
          pipeline: r.pipeline_short_name,
          pipelineName: r.pipeline_name,
          pipelineId: r.pipeline_id,
          locName: r.loc_name,
        };
        dailyMap.set(r.location_role_id, entry);
      }
      entry.days.push({ day: r.gas_day, vol: r.total_nom });
    }

    /* ── Compute per-location metrics ────────────────────────────── */

    interface LocResult {
      pipeline: string;
      pipelineName: string;
      pipelineId: number;
      data: LocationData;
    }

    const locResults: LocResult[] = [];

    for (const [locId, entry] of dailyMap) {
      const { days } = entry;
      if (days.length === 0) continue;

      const meta = metaMap.get(locId);

      // latest day's nom
      const latestEntry = days.find((d) => d.day === max_day);
      const latestNom = latestEntry?.vol ?? days[0].vol;

      // day-over-day
      const prevDay = days.find((d) => d.day < max_day);
      const dod = prevDay !== undefined ? latestNom - prevDay.vol : null;

      // trailing averages (exclude latest day)
      const trailing = days.filter((d) => d.day < max_day);
      const trailing7 = trailing.slice(0, 7);
      const trailing30 = trailing.slice(0, 30);

      const avg7d =
        trailing7.length > 0
          ? trailing7.reduce((s, d) => s + d.vol, 0) / trailing7.length
          : null;
      const avg30d =
        trailing30.length > 0
          ? trailing30.reduce((s, d) => s + d.vol, 0) / trailing30.length
          : null;

      const delta7d = avg7d !== null ? latestNom - avg7d : null;
      const delta30d = avg30d !== null ? latestNom - avg30d : null;

      // sparkline: last 7 entries (newest first) → reverse for chart
      const spark = days.slice(0, 7).map((d) => d.vol).reverse();

      const metadataObj: Record<string, unknown> = meta
        ? {
            pipeline_id: meta.pipeline_id,
            pipeline_name: meta.pipeline_name,
            pipeline_short_name: meta.pipeline_short_name,
            tariff_zone: meta.tariff_zone,
            tz_id: meta.tz_id,
            state: meta.state,
            county: meta.county,
            loc_name: meta.loc_name,
            location_id: meta.location_id,
            location_role_id: meta.location_role_id,
            facility: meta.facility,
            role: meta.role,
            role_code: meta.role_code,
            interconnecting_entity: meta.interconnecting_entity,
            interconnecting_pipeline_short_name: meta.interconnecting_pipeline_short_name,
            meter: meta.meter,
            drn: meta.drn,
            latitude: meta.latitude,
            longitude: meta.longitude,
            sign: meta.sign,
            cycle_code: meta.cycle_code,
            cycle_name: meta.cycle_name,
            units: meta.units,
            pipeline_balance_flag: meta.pipeline_balance_flag,
            storage_flag: meta.storage_flag,
          }
        : {};

      locResults.push({
        pipeline: entry.pipeline,
        pipelineName: entry.pipelineName,
        pipelineId: entry.pipelineId,
        data: {
          locationRoleId: locId,
          locName: entry.locName,
          latestNom: Math.round(latestNom),
          dod: dod !== null ? Math.round(dod) : null,
          avg7d: avg7d !== null ? Math.round(avg7d) : null,
          avg30d: avg30d !== null ? Math.round(avg30d) : null,
          delta7d: delta7d !== null ? Math.round(delta7d) : null,
          delta30d: delta30d !== null ? Math.round(delta30d) : null,
          sparkline: spark.map(Math.round),
          metadata: metadataObj,
        },
      });
    }

    /* ── Group into pipelines ────────────────────────────────────── */

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
      const summaryDod = locs.every((l) => l.data.dod !== null)
        ? locs.reduce((s, l) => s + (l.data.dod ?? 0), 0)
        : null;
      const summaryDelta7d = locs.every((l) => l.data.delta7d !== null)
        ? locs.reduce((s, l) => s + (l.data.delta7d ?? 0), 0)
        : null;
      const summaryDelta30d = locs.every((l) => l.data.delta30d !== null)
        ? locs.reduce((s, l) => s + (l.data.delta30d ?? 0), 0)
        : null;

      const regions = [...new Set(locs.map((l) => l.data.locName))];

      pipelines.push({
        pipelineShortName: pipelineName,
        pipelineName: first.pipelineName,
        pipelineId: first.pipelineId,
        regions,
        latestDay: max_day,
        summaryLatest,
        summaryDod,
        summaryDelta7d,
        summaryDelta30d,
        locations: locs.map((l) => l.data),
      });
    }

    pipelines.sort((a, b) => Math.abs(b.summaryLatest) - Math.abs(a.summaryLatest));

    return NextResponse.json(
      { pipelines, latestDay: max_day },
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
