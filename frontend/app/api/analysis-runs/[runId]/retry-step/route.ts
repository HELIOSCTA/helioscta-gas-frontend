import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// POST /api/analysis-runs/[runId]/retry-step — reset a step to pending
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { runId } = await params;

  try {
    const body = await request.json();
    const { stepName } = body;

    if (!stepName) {
      return NextResponse.json({ error: "stepName is required" }, { status: 400 });
    }

    const result = await query(
      `UPDATE helioscta_agents.pack_run_steps
       SET status = 'pending',
           started_at = NULL,
           completed_at = NULL,
           log_text = NULL,
           retry_count = retry_count + 1
       WHERE run_id = $1 AND step_name = $2
       RETURNING step_id`,
      [runId, stepName]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    // Reset run status back to running if it was failed
    await query(
      `UPDATE helioscta_agents.pack_runs SET status = 'running', completed_at = NULL, error_summary = NULL WHERE run_id = $1 AND status = 'failed'`,
      [runId]
    );

    return NextResponse.json({ retried: true, step_id: result.rows[0].step_id });
  } catch (error) {
    console.error("[retry-step] POST error:", error);
    return NextResponse.json({ error: "Failed to retry step" }, { status: 500 });
  }
}
