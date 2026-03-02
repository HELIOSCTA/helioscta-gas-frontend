/** Model routing — routes requests to cheaper models based on complexity.
 *  Gated by MODEL_ROUTER_ENABLED feature flag (defaults off). */

import { MODEL_ROUTER_ENABLED } from "@/lib/feature-flags";
import { MAX_OUTPUT_TOKENS } from "@/lib/token-costs";

type Complexity = "low" | "medium" | "high";

interface ModelRoute {
  model: string;
  maxTokens: number;
}

/** Classify request complexity from message text and context size */
export function classifyRequest(
  messageText: string,
  contextTokens: number,
  messageCount: number
): Complexity {
  const textLen = messageText.length;

  // High complexity: long messages, large context, deep conversations
  if (textLen > 800 || contextTokens > 2000 || messageCount > 8) return "high";

  // Low complexity: short messages, minimal context, early in conversation
  if (textLen < 150 && contextTokens < 500 && messageCount <= 3) return "low";

  return "medium";
}

/** Map complexity to model + maxTokens tier */
export function routeModel(
  complexity: Complexity,
  agentModel: string
): ModelRoute {
  // When flag is off, always use the agent's configured model
  if (!MODEL_ROUTER_ENABLED) {
    return { model: agentModel, maxTokens: MAX_OUTPUT_TOKENS.chat };
  }

  switch (complexity) {
    case "low":
      return { model: "claude-haiku-3-5-20241022", maxTokens: 300 };
    case "medium":
      return { model: "claude-sonnet-4-6", maxTokens: MAX_OUTPUT_TOKENS.chat };
    case "high":
      return { model: agentModel, maxTokens: MAX_OUTPUT_TOKENS.chat };
  }
}
