import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

interface ConversationRow {
  conversation_id: number;
  agent_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  message_count: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { agentId } = await params;
  try {
    const result = await query<ConversationRow>(
      `SELECT c.conversation_id, c.agent_id, c.title, c.created_at, c.updated_at,
              COUNT(m.message_id)::text AS message_count
       FROM helioscta_agents.conversations c
       LEFT JOIN helioscta_agents.messages m ON m.conversation_id = c.conversation_id
       WHERE c.agent_id = $1 AND c.is_active = TRUE
       GROUP BY c.conversation_id
       ORDER BY c.updated_at DESC`,
      [agentId]
    );
    return NextResponse.json({ conversations: result.rows });
  } catch (error) {
    console.error("[conversations] DB query failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { agentId } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const title = body.title || null;

    const result = await query<{ conversation_id: number }>(
      `INSERT INTO helioscta_agents.conversations (agent_id, title)
       VALUES ($1, $2)
       RETURNING conversation_id`,
      [agentId, title]
    );
    return NextResponse.json(
      { conversation_id: result.rows[0].conversation_id },
      { status: 201 }
    );
  } catch (error) {
    console.error("[conversations] Create failed:", error);
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 }
    );
  }
}
