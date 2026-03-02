import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { PACK_STEPS } from "@/lib/types/analysis";
import { buildRunOutputRoot } from "@/lib/run-paths";

export const dynamic = "force-dynamic";

// POST /api/analysis-packs/[packId]/runs — start a new run
export async function POST(
  request: Request,
  { params }: { params: Promise<{ packId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userEmail } = authResult;

  const { packId } = await params;

  try {
    // Verify pack exists
    const packCheck = await query(
      `SELECT pack_id FROM helioscta_agents.analysis_packs WHERE pack_id = $1 AND is_active = TRUE`,
      [packId]
    );
    if (packCheck.rows.length === 0) {
      return NextResponse.json({ error: "Pack not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const tradeDate = body.tradeDate ?? null;

    // Create the run
    const runResult = await query<{ run_id: number }>(
      `INSERT INTO helioscta_agents.pack_runs (pack_id, trade_date, status, started_by)
       VALUES ($1, $2, 'pending', $3)
       RETURNING run_id`,
      [packId, tradeDate, userEmail]
    );
    const runId = runResult.rows[0].run_id;

    // Compute and store canonical run_output_path under .prompts/<pack_slug>/runs/...
    const packRow = await query<{ slug: string }>(
      `SELECT slug FROM helioscta_agents.analysis_packs WHERE pack_id = $1`,
      [packId]
    );
    const packSlug = packRow.rows[0]?.slug ?? "default_pack";
    const runDate = new Date().toISOString().slice(0, 10);
    const runOutputPath = buildRunOutputRoot(packSlug, runDate, runId);

    await query(
      `UPDATE helioscta_agents.pack_runs SET run_output_path = $2 WHERE run_id = $1`,
      [runId, runOutputPath]
    );

    // Create step rows
    for (let i = 0; i < PACK_STEPS.length; i++) {
      await query(
        `INSERT INTO helioscta_agents.pack_run_steps (run_id, step_name, step_order, status)
         VALUES ($1, $2, $3, 'pending')`,
        [runId, PACK_STEPS[i], i + 1]
      );
    }

    return NextResponse.json({ run_id: runId, run_output_path: runOutputPath }, { status: 201 });
  } catch (error) {
    console.error("[pack-runs] POST error:", error);
    return NextResponse.json({ error: "Failed to create run" }, { status: 500 });
  }
}
