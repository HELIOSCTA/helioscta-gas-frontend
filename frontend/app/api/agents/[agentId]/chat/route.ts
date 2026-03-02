import { streamText, convertToModelMessages } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { query } from "@/lib/db";
import { uploadBlob, downloadBlob } from "@/lib/blob";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { calculateCostUsd, estimateTokens } from "@/lib/token-costs";
import { checkBudget } from "@/lib/token-budget";
import { classifyRequest, routeModel } from "@/lib/model-router";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Windowing constants
const MAX_RAW_MESSAGES = 10;
const MAX_HISTORY_TOKENS = 3000;

// Workspace context budget constants
const MAX_FILES = 5;
const MAX_SINGLE_FILE_TOKENS = 900;
const MAX_WORKSPACE_CONTEXT_TOKENS = 2500;
const MAX_SQL_RESULT_TOKENS = 1200;

interface AgentRow {
  system_prompt: string;
  model: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userEmail } = authResult;

  const { agentId } = await params;

  try {
    const body = await request.json();
    const { messages, conversationId, workspaceContext } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response("Missing messages", { status: 400 });
    }
    if (!conversationId) {
      return new Response("Missing conversationId", { status: 400 });
    }

    // Verify conversationId belongs to this agent
    const convCheck = await query<{ conversation_id: number }>(
      `SELECT conversation_id FROM helioscta_agents.conversations
       WHERE conversation_id = $1 AND agent_id = $2 AND is_active = TRUE`,
      [conversationId, agentId]
    );
    if (convCheck.rows.length === 0) {
      return new Response("Conversation not found for this agent", { status: 404 });
    }

    // Fetch agent config
    const agentResult = await query<AgentRow>(
      `SELECT system_prompt, model FROM helioscta_agents.agents
       WHERE agent_id = $1 AND is_active = TRUE`,
      [agentId]
    );
    if (agentResult.rows.length === 0) {
      return new Response("Agent not found", { status: 404 });
    }
    const agent = agentResult.rows[0];

    // Extract text from the last user message (UIMessage format has parts[])
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

    // Build workspace context supplement for system prompt
    let systemPrompt = agent.system_prompt;
    if (workspaceContext) {
      const contextParts: string[] = [];

      // Load file contents (capped)
      let contextTokensUsed = 0;
      if (workspaceContext.fileIds?.length > 0) {
        const cappedFileIds = workspaceContext.fileIds.slice(0, MAX_FILES);
        for (const fileId of cappedFileIds) {
          if (contextTokensUsed >= MAX_WORKSPACE_CONTEXT_TOKENS) break;
          try {
            const fileRow = await query<{ blob_path: string; file_name: string; file_type: string }>(
              `SELECT blob_path, file_name, file_type FROM helioscta_agents.workspace_files
               WHERE file_id = $1 AND is_active = TRUE`,
              [fileId]
            );
            if (fileRow.rows.length > 0) {
              const f = fileRow.rows[0];
              const textTypes = ["md", "csv", "py", "sql", "json", "txt"];
              if (textTypes.includes(f.file_type)) {
                const buf = await downloadBlob(f.blob_path);
                let fileContent = buf.toString("utf-8");
                // Truncate if single file exceeds token cap
                const fileTokens = estimateTokens(fileContent);
                if (fileTokens > MAX_SINGLE_FILE_TOKENS) {
                  const charLimit = MAX_SINGLE_FILE_TOKENS * 4;
                  fileContent = fileContent.slice(0, charLimit) + "\n[...truncated]";
                }
                const part = `<file name="${f.file_name}">\n${fileContent}\n</file>`;
                contextTokensUsed += estimateTokens(part);
                contextParts.push(part);
              }
            }
          } catch {
            // Non-fatal — skip file
          }
        }
      }

      // Load SQL run results (capped)
      if (workspaceContext.runId) {
        try {
          const sqlRuns = await query<{ dialect: string; sql_text: string; result_json: string }>(
            `SELECT dialect, sql_text, result_json FROM helioscta_agents.sql_runs
             WHERE run_id = $1 AND status = 'completed'
             ORDER BY created_at LIMIT 5`,
            [workspaceContext.runId]
          );
          for (const sr of sqlRuns.rows) {
            if (contextTokensUsed >= MAX_WORKSPACE_CONTEXT_TOKENS) break;
            if (sr.result_json) {
              const parsed = typeof sr.result_json === "string" ? JSON.parse(sr.result_json) : sr.result_json;
              const rows = parsed.rows ?? [];
              let preview = JSON.stringify(rows.slice(0, 20), null, 2);
              // Cap SQL result tokens — reduce rows if over budget
              if (estimateTokens(preview) > MAX_SQL_RESULT_TOKENS) {
                preview = JSON.stringify(rows.slice(0, 5), null, 2) + "\n[...truncated to 5 rows]";
              }
              const part = `<sql_result dialect="${sr.dialect}">\nQuery: ${sr.sql_text.slice(0, 200)}\nResults:\n${preview}\n</sql_result>`;
              contextTokensUsed += estimateTokens(part);
              contextParts.push(part);
            }
          }
        } catch {
          // Non-fatal
        }
      }

      if (contextParts.length > 0) {
        systemPrompt += `\n\n<workspace_context>\n${contextParts.join("\n\n")}\n</workspace_context>`;
      }
    }

    // Append output guidelines for conciseness
    systemPrompt += `\n\n<output_guidelines>Be concise. Do not repeat input context verbatim. Do not add an appendix unless the user requests one. Prefer tables and bullet points over long prose.</output_guidelines>`;

    // --- Conversation windowing ---
    // Keep first message (sets context) + last N messages; summarize dropped middle
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

    // Secondary pass: trim from oldest until under token budget
    let totalHistoryTokens = windowedMessages.reduce((sum, m) => {
      const text = m.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? m.content ?? "";
      return sum + estimateTokens(text);
    }, 0);
    while (totalHistoryTokens > MAX_HISTORY_TOKENS && windowedMessages.length > 2) {
      const removed = windowedMessages.splice(1, 1)[0];
      const removedText = removed.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? removed.content ?? "";
      totalHistoryTokens -= estimateTokens(removedText);
    }

    // Convert UIMessages to model messages for streamText
    const modelMessages = await convertToModelMessages(windowedMessages);

    // Resolve workspace ID for cost tracking
    let workspaceId: number | null = null;
    if (workspaceContext?.workspaceId) {
      const wsId = parseInt(workspaceContext.workspaceId, 10);
      if (Number.isFinite(wsId)) workspaceId = wsId;
    }

    // --- Budget guardrail check ---
    const totalInputEstimate = estimateTokens(systemPrompt) + totalHistoryTokens;
    const budgetCheck = await checkBudget(userEmail, conversationId, agent.model, totalInputEstimate);
    if (!budgetCheck.allowed) {
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

    // --- Model routing ---
    const complexity = classifyRequest(lastUserText, totalInputEstimate, windowedMessages.length);
    const route = routeModel(complexity, agent.model);

    // Stream Claude response
    const result = streamText({
      model: anthropic(route.model),
      system: systemPrompt,
      messages: modelMessages,
      maxOutputTokens: route.maxTokens,
      onFinish: async ({ text, usage }) => {
        // Calculate estimated cost using the actual model used
        const inputTokens = usage.inputTokens ?? 0;
        const outputTokens = usage.outputTokens ?? 0;
        const estimatedCost = calculateCostUsd(route.model, inputTokens, outputTokens);

        // Save assistant message with token usage and cost
        await query(
          `INSERT INTO helioscta_agents.messages
             (conversation_id, role, content, model, input_tokens, output_tokens,
              estimated_cost_usd, request_type, workspace_id, user_email)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            conversationId,
            "assistant",
            text,
            route.model,
            inputTokens || null,
            outputTokens || null,
            estimatedCost || null,
            "chat",
            workspaceId,
            userEmail,
          ]
        );

        // Auto-generate conversation title from first user message
        if (lastUserText && messages.length <= 1) {
          const titleSnippet = lastUserText.slice(0, 100);
          await query(
            `UPDATE helioscta_agents.conversations SET title = $1 WHERE conversation_id = $2 AND title IS NULL`,
            [titleSnippet, conversationId]
          );
        }

        // Auto-save agent output to workspace
        try {
          const wsSlug = `agent_${agentId}`;
          const wsResult = await query<{ workspace_id: number }>(
            `INSERT INTO helioscta_agents.workspaces (slug, display_name, workspace_type, agent_id)
             VALUES ($1, $2, 'agent', $3)
             ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
             RETURNING workspace_id`,
            [wsSlug, `Agent ${agentId}`, agentId]
          );
          const workspaceId = wsResult.rows[0].workspace_id;

          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          const fileName = `${ts}_response.md`;
          const blobPath = `agents/${agentId}/conversations/${conversationId}/${fileName}`;

          await uploadBlob(blobPath, text, "text/markdown");

          await query(
            `INSERT INTO helioscta_agents.workspace_files
               (workspace_id, file_name, blob_path, file_type, mime_type, size_bytes,
                parent_path, source, conversation_id)
             VALUES ($1, $2, $3, 'md', 'text/markdown', $4, $5, 'agent_output', $6)
             ON CONFLICT (blob_path) DO NOTHING`,
            [
              workspaceId,
              fileName,
              blobPath,
              Buffer.byteLength(text),
              `/conversations/${conversationId}/`,
              conversationId,
            ]
          );
        } catch (wsErr) {
          console.error("[chat] Workspace auto-save failed (non-fatal):", wsErr);
        }
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("[chat] Error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
