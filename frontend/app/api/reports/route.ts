import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/** GET /api/reports — list saved reports */
export async function GET() {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const result = await query<{
    report_id: number;
    conversation_id: number | null;
    agent_id: string | null;
    title: string;
    trade_date: string;
    overall_signal: string | null;
    created_by: string | null;
    created_at: string;
  }>(
    `SELECT report_id, conversation_id, agent_id, title, trade_date,
            overall_signal, created_by, created_at
     FROM helioscta_agents.daily_reports
     ORDER BY created_at DESC
     LIMIT 50`
  );

  return Response.json({ reports: result.rows });
}

/** POST /api/reports — save a report */
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userEmail } = authResult;

  const body = await request.json();
  const { conversationId, agentId, report } = body;

  if (!report || !report.title || !report.trade_date) {
    return new Response("Missing report data", { status: 400 });
  }

  const result = await query<{
    report_id: number;
    title: string;
    trade_date: string;
    overall_signal: string | null;
    created_by: string | null;
    created_at: string;
  }>(
    `INSERT INTO helioscta_agents.daily_reports
       (conversation_id, agent_id, title, trade_date, report_json, overall_signal, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING report_id, title, trade_date, overall_signal, created_by, created_at`,
    [
      conversationId || null,
      agentId || null,
      report.title,
      report.trade_date,
      JSON.stringify(report),
      report.overall_signal || null,
      userEmail,
    ]
  );

  return Response.json({ report: result.rows[0] }, { status: 201 });
}
