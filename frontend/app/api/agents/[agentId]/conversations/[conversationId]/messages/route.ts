import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

interface MessageRow {
  message_id: number;
  role: string;
  content: string;
  user_email: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
  created_at: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agentId: string; conversationId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { conversationId } = await params;
  const convId = parseInt(conversationId, 10);
  if (!Number.isFinite(convId)) {
    return NextResponse.json(
      { error: "Invalid conversation ID" },
      { status: 400 }
    );
  }

  try {
    const result = await query<MessageRow>(
      `SELECT message_id, role, content, user_email, model, input_tokens, output_tokens, estimated_cost_usd, created_at
       FROM helioscta_agents.messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [convId]
    );
    return NextResponse.json({ messages: result.rows });
  } catch (error) {
    console.error("[messages] DB query failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}
