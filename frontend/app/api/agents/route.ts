import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

interface AgentRow {
  agent_id: string;
  display_name: string;
  description: string | null;
  system_prompt: string;
  model: string;
  created_at: string;
}

export async function GET() {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const result = await query<AgentRow>(
      `SELECT agent_id, display_name, description, system_prompt, model, created_at
       FROM helioscta_agents.agents
       WHERE is_active = TRUE
       ORDER BY display_name`
    );
    return NextResponse.json({ agents: result.rows });
  } catch (error) {
    console.error("[agents] DB query failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch agents" },
      { status: 500 }
    );
  }
}
