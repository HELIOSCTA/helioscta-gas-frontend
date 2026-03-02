import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// GET /api/analysis-runs/[runId]/evidence — list evidence links
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { runId } = await params;

  try {
    const result = await query(
      `SELECT * FROM helioscta_agents.evidence_links WHERE run_id = $1 ORDER BY section_key, created_at`,
      [runId]
    );
    return NextResponse.json({ evidence: result.rows });
  } catch (error) {
    console.error("[evidence] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch evidence" }, { status: 500 });
  }
}
