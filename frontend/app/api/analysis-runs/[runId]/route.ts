import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { buildRunOutputRoot, buildRunArtifactPathMap } from "@/lib/run-paths";

export const dynamic = "force-dynamic";

// GET /api/analysis-runs/[runId] — run summary + all step statuses
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { runId } = await params;

  try {
    const runResult = await query(
      `SELECT r.*, p.slug AS pack_slug, p.display_name AS pack_name,
              w.slug AS ws_slug
       FROM helioscta_agents.pack_runs r
       JOIN helioscta_agents.analysis_packs p ON p.pack_id = r.pack_id
       JOIN helioscta_agents.workspaces w ON w.workspace_id = p.workspace_id
       WHERE r.run_id = $1`,
      [runId]
    );
    if (runResult.rows.length === 0) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const run = runResult.rows[0];

    const stepsResult = await query(
      `SELECT * FROM helioscta_agents.pack_run_steps WHERE run_id = $1 ORDER BY step_order`,
      [runId]
    );

    // Build artifact path map
    const root = run.run_output_path ||
      buildRunOutputRoot(run.ws_slug, run.run_date, run.run_id);
    const artifactPaths = buildRunArtifactPathMap(root);

    return NextResponse.json({
      run,
      steps: stepsResult.rows,
      artifact_paths: artifactPaths,
    });
  } catch (error) {
    console.error("[analysis-runs/:id] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch run" }, { status: 500 });
  }
}
