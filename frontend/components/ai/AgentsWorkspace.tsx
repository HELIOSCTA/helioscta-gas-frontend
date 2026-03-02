"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import type { UIMessage } from "ai";
import MessageBubble from "./MessageBubble";

interface Agent {
  agent_id: string;
  display_name: string;
  description: string | null;
  system_prompt: string;
  model: string;
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

export default function AgentsWorkspace() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [dbMessages, setDbMessages] = useState<DbMessage[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [promptOpen, setPromptOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedAgent = agents.find((a) => a.agent_id === selectedAgentId) ?? null;

  // Create transport with dynamic API path and conversationId in body
  const transport = useMemo(() => {
    if (!selectedAgentId) return undefined;
    return new TextStreamChatTransport({
      api: `/api/agents/${selectedAgentId}/chat`,
      body: { conversationId: activeConversationId },
    });
  }, [selectedAgentId, activeConversationId]);

  const [budgetError, setBudgetError] = useState<string | null>(null);

  // useChat hook for streaming
  const {
    messages: chatMessages,
    sendMessage,
    status,
    setMessages,
  } = useChat({
    transport,
    onError: (err) => {
      // Surface budget-exceeded errors
      const msg = err?.message ?? "";
      if (msg.includes("budget") || msg.includes("429")) {
        setBudgetError(msg);
      } else {
        console.error("[chat] Stream error:", err);
      }
    },
  });

  const isBusy = status === "submitted" || status === "streaming";

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Fetch agents on mount
  useEffect(() => {
    setLoadingAgents(true);
    fetch("/api/agents")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setAgents(data.agents ?? []);
        if (data.agents?.length > 0 && !selectedAgentId) {
          setSelectedAgentId(data.agents[0].agent_id);
        }
      })
      .catch((err) => console.error("Failed to fetch agents:", err))
      .finally(() => setLoadingAgents(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch conversations when agent changes
  useEffect(() => {
    if (!selectedAgentId) return;
    setConversations([]);
    setActiveConversationId(null);
    setDbMessages([]);
    setMessages([]);

    fetch(`/api/agents/${selectedAgentId}/conversations`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
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

    fetch(
      `/api/agents/${selectedAgentId}/conversations/${activeConversationId}/messages`
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const msgs: DbMessage[] = data.messages ?? [];
        setDbMessages(msgs);
        // Seed useChat with historical messages so context is preserved
        setMessages(
          msgs.map((m) => ({
            id: String(m.message_id),
            role: m.role,
            parts: [{ type: "text" as const, text: m.content }],
          }))
        );
      })
      .catch((err) => console.error("Failed to fetch messages:", err));
  }, [selectedAgentId, activeConversationId, setMessages]);

  // Create new conversation
  const createConversation = useCallback(async () => {
    if (!selectedAgentId) return;
    try {
      const res = await fetch(
        `/api/agents/${selectedAgentId}/conversations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
  }, [selectedAgentId, setMessages]);

  // Send message handler
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !activeConversationId || isBusy) return;
    setInputText("");
    sendMessage({ text });
  }, [inputText, activeConversationId, isBusy, sendMessage]);

  // Handle Enter key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Select agent
  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    setPromptOpen(false);
  }, []);

  if (loadingAgents) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-500">Loading agents...</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] rounded-xl border border-gray-800 bg-[#0b0d14] overflow-hidden">
      {/* Left panel: Agent list + conversations */}
      <div className="w-64 flex-shrink-0 border-r border-gray-800 flex flex-col">
        <div className="border-b border-gray-800 px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Agents
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {agents.map((agent) => (
            <button
              key={agent.agent_id}
              onClick={() => handleSelectAgent(agent.agent_id)}
              className={`flex w-full flex-col gap-0.5 px-3 py-3 text-left transition-colors border-b border-gray-800/50 ${
                selectedAgentId === agent.agent_id
                  ? "bg-gray-800/60 text-white"
                  : "text-gray-400 hover:bg-gray-800/30 hover:text-gray-200"
              }`}
            >
              <span className="text-sm font-medium">{agent.display_name}</span>
              {agent.description && (
                <span className="text-[11px] text-gray-500 line-clamp-2">
                  {agent.description}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Conversation list */}
        {selectedAgentId && (
          <div className="border-t border-gray-800">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                Conversations
              </p>
              <button
                onClick={createConversation}
                className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                title="New conversation"
              >
                +
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {conversations.map((conv) => (
                <button
                  key={conv.conversation_id}
                  onClick={() => setActiveConversationId(conv.conversation_id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                    activeConversationId === conv.conversation_id
                      ? "bg-gray-800/60 text-gray-200"
                      : "text-gray-500 hover:bg-gray-800/30 hover:text-gray-300"
                  }`}
                >
                  <span className="truncate">
                    {conv.title || `Conversation #${conv.conversation_id}`}
                  </span>
                  <span className="ml-auto flex-shrink-0 text-[10px] text-gray-600">
                    {conv.message_count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right panel: Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* System prompt (collapsible) */}
        {selectedAgent && (
          <div className="border-b border-gray-800">
            <button
              onClick={() => setPromptOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-2 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-400">
                  {selectedAgent.display_name}
                </span>
                <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500">
                  {selectedAgent.model}
                </span>
                {dbMessages.length > 0 && (() => {
                  const total = dbMessages.reduce((sum, m) => sum + (m.estimated_cost_usd ?? 0), 0);
                  return total > 0 ? (
                    <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500">
                      ${total < 0.01 ? total.toFixed(4) : total.toFixed(2)}
                    </span>
                  ) : null;
                })()}
              </div>
              <span className="text-[10px] text-gray-600">
                {promptOpen ? "Hide prompt" : "Show prompt"}
              </span>
            </button>
            {promptOpen && (
              <div className="border-t border-gray-800 bg-[#0f1117] px-4 py-3 max-h-48 overflow-y-auto">
                <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">
                  {selectedAgent.system_prompt}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Budget error banner */}
        {budgetError && (
          <div className="mx-4 mt-2 rounded-lg border border-amber-600/40 bg-amber-900/20 px-4 py-2 text-xs text-amber-300">
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
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {chatMessages.length === 0 && !isBusy && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-gray-600">
                Start a conversation with{" "}
                <span className="text-gray-400">
                  {selectedAgent?.display_name ?? "an agent"}
                </span>
              </p>
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
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-gray-800 px-4 py-3 flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeConversationId
                ? "Type a message..."
                : "Creating conversation..."
            }
            disabled={!activeConversationId || isBusy}
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-gray-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!activeConversationId || isBusy || !inputText.trim()}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isBusy ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
