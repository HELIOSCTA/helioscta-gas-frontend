import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// GET /api/workspaces/[workspaceId]/sql-runs — SQL run history
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { workspaceId } = await params;
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  try {
    let sql = `SELECT sql_run_id, run_id, workspace_id, step_id, dialect, sql_text,
                      executed_by, status, row_count, elapsed_ms, truncated, error_text, created_at
               FROM helioscta_agents.sql_runs
               WHERE workspace_id = $1`;
    const sqlParams: unknown[] = [workspaceId];

    if (runId) {
      sql += ` AND run_id = $2`;
      sqlParams.push(runId);
    }

    sql += ` ORDER BY created_at DESC LIMIT 50`;

    const result = await query(sql, sqlParams);
    return NextResponse.json({ sql_runs: result.rows });
  } catch (error) {
    console.error("[sql-runs] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch SQL runs" }, { status: 500 });
  }
}
