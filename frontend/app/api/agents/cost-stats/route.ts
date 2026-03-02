import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

interface CostRow {
  date: string;
  model: string;
  user_email: string;
  total_input_tokens: string;
  total_output_tokens: string;
  total_cost_usd: string;
  message_count: string;
}

export async function GET() {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const result = await query<CostRow>(
      `SELECT
         DATE(created_at) as date,
         COALESCE(model, 'unknown') as model,
         COALESCE(user_email, 'unknown') as user_email,
         SUM(input_tokens)::TEXT as total_input_tokens,
         SUM(output_tokens)::TEXT as total_output_tokens,
         SUM(estimated_cost_usd)::TEXT as total_cost_usd,
         COUNT(*)::TEXT as message_count
       FROM helioscta_agents.messages
       WHERE estimated_cost_usd IS NOT NULL
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at), model, user_email
       ORDER BY date DESC, model`
    );

    return NextResponse.json({ stats: result.rows });
  } catch (error) {
    console.error("[cost-stats] DB query failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch cost stats" },
      { status: 500 }
    );
  }
}
