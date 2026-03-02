import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// GET /api/analysis-runs/[runId]/artifacts — list report artifacts
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { runId } = await params;

  try {
    const result = await query(
      `SELECT * FROM helioscta_agents.report_artifacts WHERE run_id = $1 ORDER BY created_at`,
      [runId]
    );
    return NextResponse.json({ artifacts: result.rows });
  } catch (error) {
    console.error("[artifacts] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch artifacts" }, { status: 500 });
  }
}
