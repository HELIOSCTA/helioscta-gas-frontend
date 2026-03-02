/** Token cost calculation utilities */

/** Cost per 1M tokens (input / output) in USD */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6":          { input: 3.00,  output: 15.00 },
  "claude-sonnet-4-5-20250514": { input: 3.00,  output: 15.00 },
  "claude-haiku-3-5-20241022":  { input: 0.80,  output: 4.00 },
  "claude-opus-4-6":            { input: 15.00, output: 75.00 },
};

/** Max output tokens by request type */
export const MAX_OUTPUT_TOKENS: Record<string, number> = {
  chat: 500,
  draft_section: 1000,
  full_report: 2200,
  summary: 400,
};

/**
 * Calculate estimated cost in USD from token counts and model.
 * Falls back to sonnet pricing for unknown models.
 */
export function calculateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-4-6"];
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}

/** Rough token estimate from text (~4 chars per token) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Format cost for display */
export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
