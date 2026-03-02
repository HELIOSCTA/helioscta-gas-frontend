import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

interface WorkspaceRow {
  workspace_id: number;
  slug: string;
  display_name: string;
  workspace_type: string;
  agent_id: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// GET /api/workspaces — list all active workspaces
export async function GET() {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const result = await query<WorkspaceRow>(
      `SELECT workspace_id, slug, display_name, workspace_type, agent_id, created_by, created_at, updated_at
       FROM helioscta_agents.workspaces
       WHERE is_active = TRUE
       ORDER BY updated_at DESC`
    );
    return NextResponse.json({ workspaces: result.rows });
  } catch (error) {
    console.error("[workspaces] GET error:", error);
    return NextResponse.json(
      { error: "Failed to list workspaces" },
      { status: 500 }
    );
  }
}

// POST /api/workspaces — create a new workspace
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();
    const { slug, displayName, workspaceType, agentId, createdBy } = body;

    if (!slug || !displayName) {
      return NextResponse.json(
        { error: "slug and displayName are required" },
        { status: 400 }
      );
    }

    const result = await query<{ workspace_id: number }>(
      `INSERT INTO helioscta_agents.workspaces (slug, display_name, workspace_type, agent_id, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
       RETURNING workspace_id`,
      [slug, displayName, workspaceType ?? "project", agentId ?? null, createdBy ?? null]
    );

    return NextResponse.json({
      workspace_id: result.rows[0].workspace_id,
      slug,
    });
  } catch (error) {
    console.error("[workspaces] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create workspace" },
      { status: 500 }
    );
  }
}
