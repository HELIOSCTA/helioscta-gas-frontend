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

  try {
    const result: Record<string, unknown> = {};

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

          const roleRows = await mssqlQuery<{ location_role_id: number }>(
            `SELECT DISTINCT location_role_id
             FROM ${TABLE}
             WHERE pipeline_short_name IN (${pipelineInClause})
               AND loc_name IN (${locNameInClause})
             ORDER BY location_role_id`,
            params
          );
          result.location_role_ids = roleRows
            .map((r) => r.location_role_id)
            .filter((v) => v != null);
        } else {
          // Cascading: fetch loc_names + location_role_ids for selected pipelines
          const [locRows, roleRows] = await Promise.all([
            mssqlQuery<{ loc_name: string }>(
              `SELECT DISTINCT loc_name
               FROM ${TABLE}
               WHERE pipeline_short_name IN (${pipelineInClause})
               ORDER BY loc_name`,
              params
            ),
            mssqlQuery<{ location_role_id: number }>(
              `SELECT DISTINCT location_role_id
               FROM ${TABLE}
               WHERE pipeline_short_name IN (${pipelineInClause})
               ORDER BY location_role_id`,
              params
            ),
          ]);

          result.loc_names = locRows.map((r) => r.loc_name).filter(Boolean);
          result.location_role_ids = roleRows
            .map((r) => r.location_role_id)
            .filter((v) => v != null);
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
