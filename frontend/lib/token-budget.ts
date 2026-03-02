/** Budget guardrails for token spend */

import { query } from "@/lib/db";
import { calculateCostUsd } from "@/lib/token-costs";

const MAX_COST_PER_CHAT_TURN_USD = parseFloat(process.env.MAX_COST_PER_CHAT_TURN_USD ?? "0.05");
const MAX_COST_PER_USER_PER_DAY_USD = parseFloat(process.env.MAX_COST_PER_USER_PER_DAY_USD ?? "10.00");
const MAX_COST_PER_CONVERSATION_USD = parseFloat(process.env.MAX_COST_PER_CONVERSATION_USD ?? "2.00");

interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  estimatedCostUsd: number;
  remainingBudgetUsd: number;
}

/**
 * Check if a request is within budget limits.
 * Returns { allowed, reason, estimatedCostUsd, remainingBudgetUsd }.
 */
export async function checkBudget(
  userEmail: string,
  conversationId: number,
  model: string,
  estimatedInputTokens: number
): Promise<BudgetCheckResult> {
  // Estimate this turn's cost (assume ~500 output tokens for chat)
  const estimatedOutputTokens = 500;
  const estimatedCost = calculateCostUsd(model, estimatedInputTokens, estimatedOutputTokens);

  // Check per-turn limit
  if (estimatedCost > MAX_COST_PER_CHAT_TURN_USD) {
    return {
      allowed: false,
      reason: `Estimated cost ($${estimatedCost.toFixed(4)}) exceeds per-turn limit ($${MAX_COST_PER_CHAT_TURN_USD.toFixed(2)})`,
      estimatedCostUsd: estimatedCost,
      remainingBudgetUsd: 0,
    };
  }

  // Check daily spend for user
  const dailyResult = await query<{ total_cost: string }>(
    `SELECT COALESCE(SUM(estimated_cost_usd), 0) as total_cost
     FROM helioscta_agents.messages
     WHERE user_email = $1 AND created_at >= NOW() - INTERVAL '1 day'
       AND estimated_cost_usd IS NOT NULL`,
    [userEmail]
  );
  const dailySpent = parseFloat(dailyResult.rows[0]?.total_cost ?? "0");
  const dailyRemaining = MAX_COST_PER_USER_PER_DAY_USD - dailySpent;

  if (dailySpent + estimatedCost > MAX_COST_PER_USER_PER_DAY_USD) {
    return {
      allowed: false,
      reason: `Daily budget exceeded. Spent $${dailySpent.toFixed(2)} of $${MAX_COST_PER_USER_PER_DAY_USD.toFixed(2)} daily limit.`,
      estimatedCostUsd: estimatedCost,
      remainingBudgetUsd: Math.max(0, dailyRemaining),
    };
  }

  // Check conversation spend
  const convResult = await query<{ total_cost: string }>(
    `SELECT COALESCE(SUM(estimated_cost_usd), 0) as total_cost
     FROM helioscta_agents.messages
     WHERE conversation_id = $1 AND estimated_cost_usd IS NOT NULL`,
    [conversationId]
  );
  const convSpent = parseFloat(convResult.rows[0]?.total_cost ?? "0");
  const convRemaining = MAX_COST_PER_CONVERSATION_USD - convSpent;

  if (convSpent + estimatedCost > MAX_COST_PER_CONVERSATION_USD) {
    return {
      allowed: false,
      reason: `Conversation budget exceeded. Spent $${convSpent.toFixed(2)} of $${MAX_COST_PER_CONVERSATION_USD.toFixed(2)} limit. Start a new conversation.`,
      estimatedCostUsd: estimatedCost,
      remainingBudgetUsd: Math.max(0, convRemaining),
    };
  }

  return {
    allowed: true,
    estimatedCostUsd: estimatedCost,
    remainingBudgetUsd: Math.min(dailyRemaining, convRemaining),
  };
}
