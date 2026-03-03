import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// GET /api/datasets/catalog — list available tables from information_schema
export async function GET() {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const result = await query(
      `SELECT
         t.table_schema   AS schema_name,
         t.table_name,
         COUNT(c.column_name)::int AS column_count,
         json_agg(
           json_build_object(
             'column_name', c.column_name,
             'data_type',   c.data_type
           ) ORDER BY c.ordinal_position
         ) AS columns
       FROM information_schema.tables t
       JOIN information_schema.columns c
         ON c.table_schema = t.table_schema
        AND c.table_name   = t.table_name
       WHERE t.table_schema IN ('gas_ebbs', 'helioscta_agents')
         AND t.table_type = 'BASE TABLE'
       GROUP BY t.table_schema, t.table_name
       ORDER BY t.table_schema, t.table_name`
    );

    return NextResponse.json({ tables: result.rows });
  } catch (err) {
    console.error("Failed to fetch dataset catalog:", err);
    return NextResponse.json(
      { error: "Failed to fetch dataset catalog" },
      { status: 500 }
    );
  }
}
