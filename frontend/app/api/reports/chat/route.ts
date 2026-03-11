import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { anthropic } from "@ai-sdk/anthropic";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { calculateCostUsd, estimateTokens } from "@/lib/token-costs";
import { checkBudget } from "@/lib/token-budget";
import { loadMcpServers } from "@/lib/mcp-config";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Windowing constants
const MAX_RAW_MESSAGES = 10;
const MAX_HISTORY_TOKENS = 3000;

// Higher per-turn budget for report generation
const REPORT_PER_TURN_LIMIT_USD = 0.50;

// Report agent max output
const MAX_REPORT_OUTPUT_TOKENS = 4096;

interface AgentRow {
  system_prompt: string;
  model: string;
}

// Default system prompt if no agent is configured
const DEFAULT_REPORT_SYSTEM_PROMPT = `You are a senior natural gas market analyst at Helios CTA. You have access to MCP tools that can query the PostgreSQL database.

## Database Schema
The database has a schema called \`gas_ebbs\` with critical notice tables for 20 US pipelines:
algonquin, anr, columbia_gas, el_paso, florida_gas, gulf_south, iroquois, millennium, mountain_valley, ngpl, northern_natural, northwest, panhandle_eastern, rex, rover, southeast_supply, southern_pines, texas_eastern, tgp, transco.

Each pipeline has a table: \`gas_ebbs.{pipeline}_critical_notices\` with columns typically including:
- notice_identifier (PK), pipeline_name, subject, notice_type, posting_date, effective_date, end_date, notice_text, critical_notice_type, url

There is also \`ice_cash_prices\` schema with cash pricing data, and \`noms_v1_2026_jan_02\` schema with Genscape nomination data.

## Report Output Format
When asked to generate a report, output a structured JSON report inside a fenced code block:

\`\`\`json
{
  "version": 1,
  "title": "...",
  "summary": "...",
  "overall_signal": "bullish" | "bearish" | "neutral",
  "trade_date": "YYYY-MM-DD",
  "sections": [
    { "type": "narrative", "title": "...", "markdown": "..." },
    { "type": "metric_card", "title": "...", "metrics": [{ "label": "...", "value": "...", "delta": "...", "trend": "up|down|flat", "signal": "bullish|bearish|neutral" }] },
    { "type": "table", "title": "...", "columns": [{ "key": "...", "label": "...", "format": "string|number|currency|percent|date" }], "rows": [...] },
    { "type": "chart", "title": "...", "chartType": "line|bar|area|composed", "xKey": "...", "series": [{ "key": "...", "label": "...", "color": "...", "type": "line|bar|area" }], "data": [...] },
    { "type": "signal", "title": "...", "direction": "bullish|bearish|neutral", "confidence": 0.0-1.0, "rationale": "..." }
  ]
}
\`\`\`

## Instructions
1. Use MCP tools to query the database for current pipeline data
2. Analyze critical notices, nominations, and pricing data
3. Provide market commentary with trade signals
4. Always output structured report JSON when generating reports
5. Be concise but thorough in your analysis`;

export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userEmail } = authResult;

  // Create MCP clients from config
  const mcpServers = loadMcpServers();
  const mcpClients: Awaited<ReturnType<typeof createMCPClient>>[] = [];

  try {
    const body = await request.json();
    const { messages, conversationId, agentId } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response("Missing messages", { status: 400 });
    }
    if (!conversationId) {
      return new Response("Missing conversationId", { status: 400 });
    }

    // Verify conversation belongs to this agent
    const convCheck = await query<{ conversation_id: number }>(
      `SELECT conversation_id FROM helioscta_agents.conversations
       WHERE conversation_id = $1 AND agent_id = $2 AND is_active = TRUE`,
      [conversationId, agentId ?? "agt-daily-report"]
    );
    if (convCheck.rows.length === 0) {
      return new Response("Conversation not found for this agent", { status: 404 });
    }

    // Fetch agent config (use default if not found)
    let systemPrompt = DEFAULT_REPORT_SYSTEM_PROMPT;
    let agentModel = "claude-sonnet-4-6";

    if (agentId) {
      const agentResult = await query<AgentRow>(
        `SELECT system_prompt, model FROM helioscta_agents.agents
         WHERE agent_id = $1 AND is_active = TRUE`,
        [agentId]
      );
      if (agentResult.rows.length > 0) {
        systemPrompt = agentResult.rows[0].system_prompt;
        agentModel = agentResult.rows[0].model;
      }
    }

    // Extract text from the last user message
    const lastMsg = messages[messages.length - 1];
    let lastUserText = "";
    if (lastMsg.role === "user") {
      if (lastMsg.parts && Array.isArray(lastMsg.parts)) {
        lastUserText = lastMsg.parts
          .filter((p: { type: string }) => p.type === "text")
          .map((p: { text: string }) => p.text)
          .join("");
      } else if (lastMsg.content) {
        lastUserText = lastMsg.content;
      }
    }

    // Save the user message to DB
    if (lastUserText) {
      await query(
        `INSERT INTO helioscta_agents.messages (conversation_id, role, content, user_email)
         VALUES ($1, $2, $3, $4)`,
        [conversationId, "user", lastUserText, userEmail]
      );
    }

    // Update conversation timestamp
    await query(
      `UPDATE helioscta_agents.conversations SET updated_at = NOW() WHERE conversation_id = $1`,
      [conversationId]
    );

    systemPrompt += `\n\n<output_guidelines>Be concise. Prefer tables and bullet points over long prose. When generating a report, always include the structured JSON block.</output_guidelines>`;

    // --- Conversation windowing ---
    let windowedMessages = messages;
    if (messages.length > MAX_RAW_MESSAGES + 1) {
      const first = messages[0];
      const tail = messages.slice(-MAX_RAW_MESSAGES);
      const droppedCount = messages.length - MAX_RAW_MESSAGES - 1;
      const summaryMsg = {
        id: "window-summary",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: `[${droppedCount} earlier messages omitted for context window efficiency]` }],
      };
      windowedMessages = [first, summaryMsg, ...tail];
    }

    // Secondary pass: trim oldest until under token budget
    let totalHistoryTokens = windowedMessages.reduce((sum: number, m: { parts?: { text?: string }[]; content?: string }) => {
      const text = m.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? m.content ?? "";
      return sum + estimateTokens(text);
    }, 0);
    while (totalHistoryTokens > MAX_HISTORY_TOKENS && windowedMessages.length > 2) {
      const removed = windowedMessages.splice(1, 1)[0];
      const removedText = removed.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? removed.content ?? "";
      totalHistoryTokens -= estimateTokens(removedText);
    }

    const modelMessages = await convertToModelMessages(windowedMessages);

    // --- Budget guardrail check (higher limit for reports) ---
    const totalInputEstimate = estimateTokens(systemPrompt) + totalHistoryTokens;
    const budgetCheck = await checkBudget(userEmail, conversationId, agentModel, totalInputEstimate);
    if (!budgetCheck.allowed) {
      // Allow if estimated cost is within the report per-turn limit
      const estimatedCost = calculateCostUsd(agentModel, totalInputEstimate, 500);
      if (estimatedCost > REPORT_PER_TURN_LIMIT_USD) {
        return new Response(
          JSON.stringify({
            error: "budget_exceeded",
            message: budgetCheck.reason,
            estimatedCost: budgetCheck.estimatedCostUsd,
            remainingBudget: budgetCheck.remainingBudgetUsd,
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // --- Connect MCP clients and gather tools ---
    let allTools: Record<string, unknown> = {};

    for (const serverConfig of mcpServers) {
      try {
        const client = await createMCPClient({
          transport: {
            type: serverConfig.transport,
            url: serverConfig.url,
            headers: serverConfig.headers,
          },
        });
        mcpClients.push(client);
        const tools = await client.tools();
        allTools = { ...allTools, ...tools };
      } catch (err) {
        console.error(`[reports/chat] Failed to connect MCP server "${serverConfig.name}":`, err);
      }
    }

    // Stream Claude response with MCP tools
    const result = streamText({
      model: anthropic(agentModel),
      system: systemPrompt,
      messages: modelMessages,
      maxOutputTokens: MAX_REPORT_OUTPUT_TOKENS,
      stopWhen: stepCountIs(10),
      ...(Object.keys(allTools).length > 0 ? { tools: allTools as Parameters<typeof streamText>[0]["tools"] } : {}),
      onFinish: async ({ text, usage }) => {
        // Close MCP clients
        for (const client of mcpClients) {
          try {
            await client.close();
          } catch {
            // Non-fatal
          }
        }

        const inputTokens = usage.inputTokens ?? 0;
        const outputTokens = usage.outputTokens ?? 0;
        const estimatedCost = calculateCostUsd(agentModel, inputTokens, outputTokens);

        // Save assistant message
        await query(
          `INSERT INTO helioscta_agents.messages
             (conversation_id, role, content, model, input_tokens, output_tokens,
              estimated_cost_usd, request_type, user_email)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            conversationId,
            "assistant",
            text,
            agentModel,
            inputTokens || null,
            outputTokens || null,
            estimatedCost || null,
            "report",
            userEmail,
          ]
        );

        // Auto-generate conversation title
        if (lastUserText && messages.length <= 1) {
          const titleSnippet = lastUserText.slice(0, 100);
          await query(
            `UPDATE helioscta_agents.conversations SET title = $1 WHERE conversation_id = $2 AND title IS NULL`,
            [titleSnippet, conversationId]
          );
        }
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    // Close MCP clients on error
    for (const client of mcpClients) {
      try {
        await client.close();
      } catch {
        // Non-fatal
      }
    }
    console.error("[reports/chat] Error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
