import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// POST /api/analysis-runs/[runId]/finalize — mark run as finalized
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { runId } = await params;

  try {
    const result = await query(
      `UPDATE helioscta_agents.pack_runs
       SET status = 'finalized', completed_at = NOW()
       WHERE run_id = $1 AND status IN ('completed', 'running')
       RETURNING run_id`,
      [runId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Run not found or not in a finalizable state" },
        { status: 400 }
      );
    }

    return NextResponse.json({ finalized: true });
  } catch (error) {
    console.error("[finalize] POST error:", error);
    return NextResponse.json({ error: "Failed to finalize run" }, { status: 500 });
  }
}
