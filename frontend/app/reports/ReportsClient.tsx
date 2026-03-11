"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import type { UIMessage } from "ai";
import Link from "next/link";
import MessageBubble from "@/components/ai/MessageBubble";
import ReportPreview from "@/components/reports/ReportPreview";
import ReportHistory from "@/components/reports/ReportHistory";
import type { StructuredReport, SavedReportRow } from "@/lib/types/report";

interface Agent {
  agent_id: string;
  display_name: string;
  description: string | null;
}

interface Conversation {
  conversation_id: number;
  agent_id: string;
  title: string | null;
  message_count: string;
  updated_at: string;
}

interface DbMessage {
  message_id: number;
  role: "user" | "assistant";
  content: string;
  user_email: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
  created_at: string;
}

function getTextFromParts(msg: UIMessage): string {
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Extract StructuredReport JSON from assistant text */
function extractReport(text: string): StructuredReport | null {
  // Match ```json ... ``` blocks
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
  let match;
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.version === 1 && parsed.title && parsed.sections) {
        return parsed as StructuredReport;
      }
    } catch {
      // Not valid JSON, try next block
    }
  }
  return null;
}

const DEFAULT_REPORT_PROMPT = `Generate a daily gas market report for today. Query the database for:
1. Recent critical notices across all 20 pipelines (last 7 days)
2. Any Force Majeure, OFO, or significant maintenance notices
3. Key pipeline flow changes or restrictions

Provide a structured report with:
- Executive summary
- Key metrics (notice counts by type, affected pipelines)
- Notable critical notices table
- Market signal assessment

Output the report as a structured JSON block.`;

export default function ReportsClient() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [dbMessages, setDbMessages] = useState<DbMessage[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [currentReport, setCurrentReport] = useState<StructuredReport | null>(null);
  const [savedReports, setSavedReports] = useState<SavedReportRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [inputText, setInputText] = useState("");
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Transport: TextStreamChatTransport matching the text stream response
  const transport = useMemo(() => {
    if (!selectedAgentId) return undefined;
    return new TextStreamChatTransport({
      api: "/api/reports/chat",
      body: { conversationId: activeConversationId, agentId: selectedAgentId },
    });
  }, [selectedAgentId, activeConversationId]);

  const {
    messages: chatMessages,
    sendMessage,
    status,
    setMessages,
  } = useChat({
    transport,
    onError: (err) => {
      const msg = err?.message ?? "";
      if (msg.includes("budget") || msg.includes("429")) {
        setBudgetError(msg);
      } else {
        console.error("[reports/chat] Stream error:", err);
      }
    },
  });

  const isBusy = status === "submitted" || status === "streaming";

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Extract report from latest assistant message
  useEffect(() => {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      const msg = chatMessages[i];
      if (msg.role === "assistant") {
        const text = getTextFromParts(msg);
        const report = extractReport(text);
        if (report) {
          setCurrentReport(report);
          return;
        }
      }
    }
  }, [chatMessages]);

  // Fetch agents on mount
  useEffect(() => {
    setLoadingAgents(true);
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        const allAgents: Agent[] = data.agents ?? [];
        setAgents(allAgents);
        // Prefer daily report agent
        const reportAgent = allAgents.find((a) => a.agent_id === "agt-daily-report");
        setSelectedAgentId(reportAgent?.agent_id ?? allAgents[0]?.agent_id ?? null);
      })
      .catch((err) => console.error("Failed to fetch agents:", err))
      .finally(() => setLoadingAgents(false));
  }, []);

  // Fetch saved reports on mount
  useEffect(() => {
    fetch("/api/reports")
      .then((r) => r.json())
      .then((data) => setSavedReports(data.reports ?? []))
      .catch(() => {});
  }, []);

  // Fetch conversations when agent changes
  useEffect(() => {
    if (!selectedAgentId) return;
    setConversations([]);
    setActiveConversationId(null);
    setDbMessages([]);
    setMessages([]);
    setCurrentReport(null);

    fetch(`/api/agents/${selectedAgentId}/conversations`)
      .then((r) => r.json())
      .then((data) => {
        const convos: Conversation[] = data.conversations ?? [];
        setConversations(convos);
        if (convos.length > 0) {
          setActiveConversationId(convos[0].conversation_id);
        } else {
          createConversation();
        }
      })
      .catch((err) => console.error("Failed to fetch conversations:", err));
  }, [selectedAgentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load message history when conversation changes
  useEffect(() => {
    if (!selectedAgentId || !activeConversationId) return;
    setDbMessages([]);
    setMessages([]);
    setCurrentReport(null);

    fetch(`/api/agents/${selectedAgentId}/conversations/${activeConversationId}/messages`)
      .then((r) => r.json())
      .then((data) => {
        const msgs: DbMessage[] = data.messages ?? [];
        setDbMessages(msgs);
        setMessages(
          msgs.map((m) => ({
            id: String(m.message_id),
            role: m.role,
            parts: [{ type: "text" as const, text: m.content }],
          }))
        );
        // Try to extract report from history
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === "assistant") {
            const report = extractReport(msgs[i].content);
            if (report) {
              setCurrentReport(report);
              break;
            }
          }
        }
      })
      .catch((err) => console.error("Failed to fetch messages:", err));
  }, [selectedAgentId, activeConversationId, setMessages]);

  // Create new conversation
  const createConversation = useCallback(async () => {
    if (!selectedAgentId) return;
    try {
      const res = await fetch(`/api/agents/${selectedAgentId}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      const newConvId = data.conversation_id;
      setActiveConversationId(newConvId);
      setConversations((prev) => [
        {
          conversation_id: newConvId,
          agent_id: selectedAgentId,
          title: null,
          message_count: "0",
          updated_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setDbMessages([]);
      setMessages([]);
      setCurrentReport(null);
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
  }, [selectedAgentId, setMessages]);

  // Send message
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !activeConversationId || isBusy) return;
    setInputText("");
    sendMessage({ text });
  }, [inputText, activeConversationId, isBusy, sendMessage]);

  // Generate report shortcut
  const handleGenerateReport = useCallback(() => {
    if (!activeConversationId || isBusy) return;
    sendMessage({ text: DEFAULT_REPORT_PROMPT });
  }, [activeConversationId, isBusy, sendMessage]);

  // Save report
  const handleSaveReport = useCallback(async () => {
    if (!currentReport || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
          agentId: selectedAgentId,
          report: currentReport,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSavedReports((prev) => [data.report, ...prev]);
      }
    } catch (err) {
      console.error("Failed to save report:", err);
    } finally {
      setSaving(false);
    }
  }, [currentReport, saving, activeConversationId, selectedAgentId]);

  // Load a saved report
  const handleLoadReport = useCallback(async (reportId: number) => {
    try {
      const res = await fetch(`/api/reports/${reportId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.report_json) {
          setCurrentReport(data.report_json);
        }
      }
    } catch (err) {
      console.error("Failed to load report:", err);
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  if (loadingAgents) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0d14]">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0b0d14]">
      {/* Left panel: Chat */}
      <div className="flex w-[40%] min-w-[360px] flex-col border-r border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-gray-500 hover:text-gray-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </Link>
            <h1 className="text-sm font-bold text-gray-100">Daily Reports</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Agent selector */}
            <select
              value={selectedAgentId ?? ""}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 focus:border-gray-500 focus:outline-none"
            >
              {agents.map((a) => (
                <option key={a.agent_id} value={a.agent_id}>
                  {a.display_name}
                </option>
              ))}
            </select>
            <button
              onClick={createConversation}
              className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200"
              title="New conversation"
            >
              + New
            </button>
          </div>
        </div>

        {/* Conversation tabs */}
        {conversations.length > 1 && (
          <div className="flex gap-1 overflow-x-auto border-b border-gray-800 px-3 py-2">
            {conversations.slice(0, 5).map((conv) => (
              <button
                key={conv.conversation_id}
                onClick={() => setActiveConversationId(conv.conversation_id)}
                className={`flex-shrink-0 rounded px-2.5 py-1 text-xs transition-colors ${
                  activeConversationId === conv.conversation_id
                    ? "bg-gray-700 text-gray-200"
                    : "text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                }`}
              >
                {conv.title?.slice(0, 30) || `#${conv.conversation_id}`}
              </button>
            ))}
          </div>
        )}

        {/* Budget error */}
        {budgetError && (
          <div className="mx-3 mt-2 rounded-lg border border-amber-600/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
            {budgetError}
            <button
              onClick={() => setBudgetError(null)}
              className="ml-2 text-amber-400 underline hover:text-amber-200"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {chatMessages.length === 0 && !isBusy && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <p className="text-sm text-gray-600">
                Chat with the report agent or generate a daily report.
              </p>
              <button
                onClick={handleGenerateReport}
                disabled={!activeConversationId}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
              >
                Generate Daily Report
              </button>
            </div>
          )}
          {chatMessages.map((msg, idx) => {
            const dbMsg = dbMessages[idx];
            return (
              <MessageBubble
                key={msg.id}
                role={msg.role as "user" | "assistant"}
                content={getTextFromParts(msg)}
                timestamp={dbMsg?.created_at}
                userEmail={dbMsg?.user_email}
                inputTokens={dbMsg?.input_tokens}
                outputTokens={dbMsg?.output_tokens}
                estimatedCostUsd={dbMsg?.estimated_cost_usd}
              />
            );
          })}
          {isBusy && (
            <div className="flex items-center gap-2 px-2 py-1">
              <div className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" />
              <span className="text-xs text-gray-500">Generating...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-gray-800 px-3 py-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activeConversationId ? "Ask a follow-up question..." : "Creating conversation..."}
              disabled={!activeConversationId || isBusy}
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-gray-500 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!activeConversationId || isBusy || !inputText.trim()}
              className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isBusy ? "..." : "Send"}
            </button>
          </div>
          {chatMessages.length > 0 && (
            <button
              onClick={handleGenerateReport}
              disabled={!activeConversationId || isBusy}
              className="mt-2 w-full rounded-lg border border-emerald-600/40 bg-emerald-900/20 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-900/40 disabled:opacity-40"
            >
              Generate Daily Report
            </button>
          )}
        </div>
      </div>

      {/* Right panel: Report preview */}
      <div className="flex flex-1 flex-col">
        {/* Report header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-3">
          <h2 className="text-sm font-bold text-gray-300">Report Preview</h2>
          <div className="flex items-center gap-2">
            <ReportHistory
              reports={savedReports}
              onLoadReport={handleLoadReport}
            />
            {currentReport && (
              <button
                onClick={handleSaveReport}
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
              >
                {saving ? "Saving..." : "Save Report"}
              </button>
            )}
          </div>
        </div>

        {/* Report content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {currentReport ? (
            <ReportPreview report={currentReport} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <svg className="mx-auto h-12 w-12 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
                <p className="mt-3 text-sm text-gray-600">
                  No report generated yet.
                </p>
                <p className="mt-1 text-xs text-gray-700">
                  Use the chat to generate a daily report or load a saved one.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
