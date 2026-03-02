import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { downloadBlob } from "@/lib/blob";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { buildRunArtifactPath, RUN_SUBFOLDERS } from "@/lib/run-paths";

export const dynamic = "force-dynamic";

// GET /api/analysis-runs/[runId]/report — serve report.json for a run
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { runId } = await params;

  try {
    // Look up run's output path
    const runResult = await query<{ run_output_path: string | null }>(
      `SELECT run_output_path FROM helioscta_agents.pack_runs WHERE run_id = $1`,
      [runId]
    );

    if (runResult.rows.length === 0) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const root = runResult.rows[0].run_output_path;
    if (!root) {
      return NextResponse.json({ error: "Run has no output path" }, { status: 404 });
    }

    // Try to download report.json from reports/ subfolder
    const reportBlobPath = buildRunArtifactPath(root, RUN_SUBFOLDERS.reports, "report.json");

    try {
      const buf = await downloadBlob(reportBlobPath);
      const report = JSON.parse(buf.toString("utf-8"));
      return NextResponse.json({ report });
    } catch {
      return NextResponse.json(
        { error: "Report not yet generated" },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error("[report] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch report" }, { status: 500 });
  }
}
