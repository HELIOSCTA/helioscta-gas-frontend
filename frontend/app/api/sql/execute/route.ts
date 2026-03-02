import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { executeSql } from "@/lib/sql-executor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/sql/execute — validate, execute, record, return results
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userEmail } = authResult;

  try {
    const body = await request.json();
    const { runId, workspaceId, dialect, sqlText, stepId, maxRows, timeoutMs } = body;

    if (!dialect || !sqlText) {
      return NextResponse.json(
        { error: "dialect and sqlText are required" },
        { status: 400 }
      );
    }

    if (dialect !== "postgresql" && dialect !== "mssql") {
      return NextResponse.json(
        { error: "dialect must be 'postgresql' or 'mssql'" },
        { status: 400 }
      );
    }

    const result = await executeSql({ dialect, sqlText, maxRows, timeoutMs });

    // Record in sql_runs table
    try {
      await query(
        `INSERT INTO helioscta_agents.sql_runs
           (run_id, workspace_id, step_id, dialect, sql_text, executed_by, status, row_count, elapsed_ms, truncated, error_text, result_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          runId ?? null,
          workspaceId ?? null,
          stepId ?? null,
          dialect,
          sqlText,
          userEmail,
          result.status === "success" ? "completed" : "failed",
          result.rowCount,
          result.elapsedMs,
          result.truncated,
          result.error ?? null,
          result.status === "success"
            ? JSON.stringify({ columns: result.columns, rows: result.rows })
            : null,
        ]
      );
    } catch (logErr) {
      console.error("[sql/execute] Failed to log sql_run (non-fatal):", logErr);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[sql/execute] POST error:", error);
    return NextResponse.json({ error: "Failed to execute SQL" }, { status: 500 });
  }
}
