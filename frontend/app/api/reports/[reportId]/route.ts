import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/** GET /api/reports/[reportId] — fetch full report by ID */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { reportId } = await params;

  const result = await query<{
    report_id: number;
    conversation_id: number | null;
    agent_id: string | null;
    title: string;
    trade_date: string;
    report_json: Record<string, unknown>;
    overall_signal: string | null;
    created_by: string | null;
    created_at: string;
  }>(
    `SELECT report_id, conversation_id, agent_id, title, trade_date,
            report_json, overall_signal, created_by, created_at
     FROM helioscta_agents.daily_reports
     WHERE report_id = $1`,
    [reportId]
  );

  if (result.rows.length === 0) {
    return new Response("Report not found", { status: 404 });
  }

  return Response.json(result.rows[0]);
}

/** DELETE /api/reports/[reportId] — remove a saved report */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { reportId } = await params;

  await query(
    `DELETE FROM helioscta_agents.daily_reports WHERE report_id = $1`,
    [reportId]
  );

  return new Response(null, { status: 204 });
}
