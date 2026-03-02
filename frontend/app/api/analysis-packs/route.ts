import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// GET /api/analysis-packs — list all active packs with latest run info
export async function GET() {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const result = await query(
      `SELECT p.*,
              lr.run_id     AS latest_run_id,
              lr.status     AS latest_run_status,
              lr.run_date   AS latest_run_date,
              lr.started_at AS latest_run_started_at
       FROM helioscta_agents.analysis_packs p
       LEFT JOIN LATERAL (
         SELECT run_id, status, run_date, started_at
         FROM helioscta_agents.pack_runs
         WHERE pack_id = p.pack_id
         ORDER BY run_date DESC, started_at DESC
         LIMIT 1
       ) lr ON TRUE
       WHERE p.is_active = TRUE
       ORDER BY p.display_name`
    );
    return NextResponse.json({ packs: result.rows });
  } catch (error) {
    console.error("[analysis-packs] GET error:", error);
    return NextResponse.json({ error: "Failed to list analysis packs" }, { status: 500 });
  }
}

// POST /api/analysis-packs — create a new pack
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userEmail } = authResult;

  try {
    const body = await request.json();
    const { workspaceId, slug, displayName, description } = body;

    if (!workspaceId || !slug || !displayName) {
      return NextResponse.json(
        { error: "workspaceId, slug, and displayName are required" },
        { status: 400 }
      );
    }

    const result = await query<{ pack_id: number }>(
      `INSERT INTO helioscta_agents.analysis_packs (workspace_id, slug, display_name, description, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING pack_id`,
      [workspaceId, slug, displayName, description ?? null, userEmail]
    );

    return NextResponse.json({ pack_id: result.rows[0].pack_id }, { status: 201 });
  } catch (error) {
    console.error("[analysis-packs] POST error:", error);
    return NextResponse.json({ error: "Failed to create analysis pack" }, { status: 500 });
  }
}
