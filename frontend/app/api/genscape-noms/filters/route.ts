import { NextResponse } from "next/server";
import { mssqlQuery } from "@/lib/mssql";

export const dynamic = "force-dynamic";

const TABLE = "noms_v1_2026_jan_02.source_v1_genscape_noms";

/**
 * GET /api/genscape-noms/filters
 *
 * Base call (no params):              { pipelines: string[] }
 * With ?pipelines=X,Y:                { loc_names: string[], location_role_ids: number[] }
 * With ?pipelines=X,Y&locNames=A,B:   { location_role_ids: number[] }  (filtered by loc_names)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pipelinesParam = searchParams.get("pipelines"); // comma-separated
  const locNamesParam = searchParams.get("locNames");   // comma-separated
  const locationRoleIdsParam = searchParams.get("locationRoleIds"); // comma-separated
  const locationIdsParam = searchParams.get("locationIds"); // comma-separated (lasso import: location_id → location_role_id)

  try {
    const result: Record<string, unknown> = {};

    // --- Lasso import mode: resolve location_id → location_role_id ---
    if (locationIdsParam) {
      const locIdList = locationIdsParam.split(",").map(Number).filter(Number.isFinite);
      if (locIdList.length === 0) {
        return NextResponse.json({ pipelines: [], loc_names: [], location_role_ids: [] });
      }

      const params: Record<string, unknown> = {};
      const placeholders = locIdList.map((id, i) => {
        params[`lid${i}`] = id;
        return `@lid${i}`;
      });
      const inClause = placeholders.join(", ");
      const baseWhere = `WHERE location_id IN (${inClause})`;

      const [pipelineRows, locNameRows, roleIdRows] = await Promise.all([
        mssqlQuery<{ pipeline_short_name: string }>(
          `SELECT DISTINCT pipeline_short_name FROM ${TABLE} ${baseWhere} ORDER BY pipeline_short_name`,
          params
        ),
        mssqlQuery<{ loc_name: string }>(
          `SELECT DISTINCT loc_name FROM ${TABLE} ${baseWhere} ORDER BY loc_name`,
          params
        ),
        mssqlQuery<{ location_role_id: number }>(
          `SELECT DISTINCT location_role_id FROM ${TABLE} ${baseWhere} ORDER BY location_role_id`,
          params
        ),
      ]);

      result.pipelines = pipelineRows.map((r) => r.pipeline_short_name).filter(Boolean);
      result.loc_names = locNameRows.map((r) => r.loc_name).filter(Boolean);
      result.location_role_ids = roleIdRows.map((r) => r.location_role_id).filter((v) => v != null);

      return NextResponse.json(result, {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
        },
      });
    }

    // --- Watchlist mode: scoped to a set of location_role_ids ---
    if (locationRoleIdsParam) {
      const roleIdList = locationRoleIdsParam.split(",").map(Number).filter(Number.isFinite);
      if (roleIdList.length === 0) {
        return NextResponse.json({ pipelines: [], loc_names: [], location_role_ids: [] });
      }

      const params: Record<string, unknown> = {};
      const rPlaceholders = roleIdList.map((id, i) => {
        params[`r${i}`] = id;
        return `@r${i}`;
      });
      const roleInClause = rPlaceholders.join(", ");

      // Optionally combine with pipelines and locNames for further narrowing
      let extraWhere = "";
      if (pipelinesParam) {
        const pipelineList = pipelinesParam.split(",").filter(Boolean);
        const pPlaceholders = pipelineList.map((p, i) => {
          params[`p${i}`] = p;
          return `@p${i}`;
        });
        extraWhere += ` AND pipeline_short_name IN (${pPlaceholders.join(", ")})`;
      }
      if (locNamesParam) {
        const locNameList = locNamesParam.split(",").filter(Boolean);
        const lPlaceholders = locNameList.map((l, i) => {
          params[`l${i}`] = l;
          return `@l${i}`;
        });
        extraWhere += ` AND loc_name IN (${lPlaceholders.join(", ")})`;
      }

      const baseWhere = `WHERE location_role_id IN (${roleInClause})${extraWhere}`;

      const [pipelineRows, locNameRows, roleIdRows, detailRows] = await Promise.all([
        mssqlQuery<{ pipeline_short_name: string }>(
          `SELECT DISTINCT pipeline_short_name FROM ${TABLE} ${baseWhere} ORDER BY pipeline_short_name`,
          params
        ),
        mssqlQuery<{ loc_name: string }>(
          `SELECT DISTINCT loc_name FROM ${TABLE} ${baseWhere} ORDER BY loc_name`,
          params
        ),
        mssqlQuery<{ location_role_id: number }>(
          `SELECT DISTINCT location_role_id FROM ${TABLE} ${baseWhere} ORDER BY location_role_id`,
          params
        ),
        mssqlQuery<{ location_role_id: number; pipeline_short_name: string; tariff_zone: string; loc_name: string; location_id: number; facility: string; role: string }>(
          `SELECT DISTINCT location_role_id, pipeline_short_name, tariff_zone, loc_name, location_id, facility, role FROM ${TABLE} ${baseWhere} ORDER BY location_role_id`,
          params
        ),
      ]);

      result.pipelines = pipelineRows.map((r) => r.pipeline_short_name).filter(Boolean);
      result.loc_names = locNameRows.map((r) => r.loc_name).filter(Boolean);
      result.location_role_ids = roleIdRows.map((r) => r.location_role_id).filter((v) => v != null);
      result.role_id_details = detailRows.map((r) => ({
        location_role_id: r.location_role_id,
        pipeline: r.pipeline_short_name,
        tariff_zone: r.tariff_zone ?? "",
        loc_name: r.loc_name,
        location_id: r.location_id,
        facility: r.facility ?? "",
        role: r.role ?? "",
      }));

      return NextResponse.json(result, {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
        },
      });
    }

    if (!pipelinesParam) {
      // Base call: just pipeline list (no date range query needed)
      const pipelineRows = await mssqlQuery<{ pipeline_short_name: string }>(
        `SELECT DISTINCT pipeline_short_name FROM ${TABLE} ORDER BY pipeline_short_name`
      );
      result.pipelines = pipelineRows
        .map((r) => r.pipeline_short_name)
        .filter(Boolean);
    } else {
      const pipelineList = pipelinesParam.split(",").filter(Boolean);
      if (pipelineList.length > 0) {
        const params: Record<string, unknown> = {};
        const pPlaceholders = pipelineList.map((p, i) => {
          params[`p${i}`] = p;
          return `@p${i}`;
        });
        const pipelineInClause = pPlaceholders.join(", ");

        // If locNames provided, only return role_ids filtered by pipelines + loc_names
        if (locNamesParam) {
          const locNameList = locNamesParam.split(",").filter(Boolean);
          const lPlaceholders = locNameList.map((l, i) => {
            params[`l${i}`] = l;
            return `@l${i}`;
          });
          const locNameInClause = lPlaceholders.join(", ");
          const where = `WHERE pipeline_short_name IN (${pipelineInClause}) AND loc_name IN (${locNameInClause})`;

          const [roleRows, detailRows] = await Promise.all([
            mssqlQuery<{ location_role_id: number }>(
              `SELECT DISTINCT location_role_id FROM ${TABLE} ${where} ORDER BY location_role_id`,
              params
            ),
            mssqlQuery<{ location_role_id: number; pipeline_short_name: string; tariff_zone: string; loc_name: string; location_id: number }>(
              `SELECT DISTINCT location_role_id, pipeline_short_name, tariff_zone, loc_name, location_id FROM ${TABLE} ${where} ORDER BY pipeline_short_name, loc_name`,
              params
            ),
          ]);
          result.location_role_ids = roleRows
            .map((r) => r.location_role_id)
            .filter((v) => v != null);
          result.role_id_details = detailRows.map((r) => ({
            location_role_id: r.location_role_id,
            pipeline: r.pipeline_short_name,
            tariff_zone: r.tariff_zone ?? "",
            loc_name: r.loc_name,
            location_id: r.location_id,
          }));
        } else {
          // Cascading: fetch loc_names + location_role_ids for selected pipelines
          const where = `WHERE pipeline_short_name IN (${pipelineInClause})`;
          const [locRows, roleRows, detailRows] = await Promise.all([
            mssqlQuery<{ loc_name: string }>(
              `SELECT DISTINCT loc_name FROM ${TABLE} ${where} ORDER BY loc_name`,
              params
            ),
            mssqlQuery<{ location_role_id: number }>(
              `SELECT DISTINCT location_role_id FROM ${TABLE} ${where} ORDER BY location_role_id`,
              params
            ),
            mssqlQuery<{ location_role_id: number; pipeline_short_name: string; tariff_zone: string; loc_name: string; location_id: number }>(
              `SELECT DISTINCT location_role_id, pipeline_short_name, tariff_zone, loc_name, location_id FROM ${TABLE} ${where} ORDER BY pipeline_short_name, loc_name`,
              params
            ),
          ]);

          result.loc_names = locRows.map((r) => r.loc_name).filter(Boolean);
          result.location_role_ids = roleRows
            .map((r) => r.location_role_id)
            .filter((v) => v != null);
          result.role_id_details = detailRows.map((r) => ({
            location_role_id: r.location_role_id,
            pipeline: r.pipeline_short_name,
            tariff_zone: r.tariff_zone ?? "",
            loc_name: r.loc_name,
            location_id: r.location_id,
          }));
        }
      }
    }

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("[genscape-noms/filters] DB query failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch filter options" },
      { status: 500 }
    );
  }
}
