import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/analysis-runs/[runId]/generate-report — gather sql results, draft report
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userEmail } = authResult;

  const { runId } = await params;

  try {
    // Get SQL run results for this run
    const sqlRuns = await query(
      `SELECT sql_run_id, dialect, sql_text, row_count, result_json
       FROM helioscta_agents.sql_runs
       WHERE run_id = $1 AND status = 'completed'
       ORDER BY created_at`,
      [runId]
    );

    // Get run context
    const runResult = await query(
      `SELECT r.*, p.workspace_id, p.slug AS pack_slug
       FROM helioscta_agents.pack_runs r
       JOIN helioscta_agents.analysis_packs p ON p.pack_id = r.pack_id
       WHERE r.run_id = $1`,
      [runId]
    );

    if (runResult.rows.length === 0) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // Return context for now — Phase D will call Claude for actual report drafting
    return NextResponse.json({
      run: runResult.rows[0],
      sql_results_count: sqlRuns.rows.length,
      generated_by: userEmail,
      message: "Report generation requires agent integration (Phase D). SQL results are ready.",
    });
  } catch (error) {
    console.error("[generate-report] POST error:", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
