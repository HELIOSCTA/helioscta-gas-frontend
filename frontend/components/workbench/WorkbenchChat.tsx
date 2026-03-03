"use client";

import { useState, useCallback } from "react";
import AgentSelector from "./AgentSelector";
import ConversationList from "./ConversationList";
import CostEstimateBar from "./CostEstimateBar";
import ContextChips from "./ContextChips";

interface FileContext {
  fileId: number;
  fileName?: string;
  fileType?: string;
  sizeBytes?: number | null;
}

interface WorkbenchChatProps {
  workspaceId: string;
  selectedFiles: FileContext[];
  selectedAgentId: number | null;
  onSelectAgent: (agentId: number) => void;
  conversationId: number | null;
  onConversationChange: (conversationId: number | null) => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function WorkbenchChat({
  workspaceId,
  selectedFiles,
  selectedAgentId,
  onSelectAgent,
  conversationId,
  onConversationChange,
}: WorkbenchChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextFiles, setContextFiles] = useState<FileContext[]>(selectedFiles);

  // Sync context files when selectedFiles changes
  // (user can dismiss chips independently)

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const agentId = selectedAgentId;
      if (!agentId) {
        setMessages((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, role: "assistant", content: "No agent selected. Please select an agent first." },
        ]);
        return;
      }

      // Create conversation if none exists, otherwise reuse
      let convId = conversationId;
      if (!convId) {
        const convRes = await fetch(`/api/agents/${agentId}/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: `Workbench: ${workspaceId}` }),
        });
        const convData = await convRes.json();
        convId = convData.conversation_id;
        if (convId) onConversationChange(convId);
      }

      const chatRes = await fetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ id: userMsg.id, role: "user", parts: [{ type: "text", text: input }] }],
          conversationId: convId,
          workspaceContext: {
            workspaceId,
            fileIds: contextFiles.map((f) => f.fileId),
          },
        }),
      });

      // Handle budget exceeded
      if (chatRes.status === 429) {
        const errData = await chatRes.json().catch(() => null);
        const errMsg = errData?.message ?? "Budget limit reached. Please try again later or start a new conversation.";
        setMessages((prev) => [
          ...prev,
          { id: `budget-${Date.now()}`, role: "assistant", content: `Budget limit: ${errMsg}` },
        ]);
        return;
      }

      const reader = chatRes.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let assistantText = "";
      const assistantId = `asst-${Date.now()}`;

      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: assistantText } : m))
        );
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "assistant", content: "Failed to get response." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, workspaceId, contextFiles, selectedAgentId, conversationId, onConversationChange]);

  const handleLoadConversation = useCallback(async (convId: number) => {
    if (!selectedAgentId) return;
    onConversationChange(convId);
    try {
      const res = await fetch(`/api/agents/${selectedAgentId}/conversations/${convId}/messages`);
      const data = await res.json();
      const loaded = (data.messages ?? []).map((m: { message_id: number; role: string; content: string }) => ({
        id: `msg-${m.message_id}`,
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      setMessages(loaded);
    } catch (err) {
      console.error("Failed to load conversation:", err);
    }
  }, [selectedAgentId, onConversationChange]);

  const handleNewConversation = useCallback(() => {
    onConversationChange(null);
    setMessages([]);
  }, [onConversationChange]);

  const inputTokenEstimate = Math.ceil(input.length / 4);

  return (
    <div className="flex h-full flex-col">
      {/* Header with agent selector */}
      <div className="border-b border-gray-800 px-3 py-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            Agent Chat
          </p>
          <AgentSelector selectedAgentId={selectedAgentId} onSelect={onSelectAgent} />
        </div>
      </div>

      {/* Conversation list */}
      <ConversationList
        agentId={selectedAgentId}
        activeConversationId={conversationId}
        onSelect={handleLoadConversation}
        onNewConversation={handleNewConversation}
      />

      {/* Context chips */}
      <ContextChips
        files={contextFiles}
        onRemoveFile={(id) => setContextFiles((prev) => prev.filter((f) => f.fileId !== id))}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-gray-600 mt-4">
            Ask questions about your analysis data and reports.
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-lg px-3 py-2 text-xs ${
              msg.role === "user"
                ? "bg-cyan-900/30 text-cyan-100 ml-8"
                : "bg-gray-800/50 text-gray-300 mr-8"
            }`}
          >
            <p className="whitespace-pre-wrap">{msg.content}</p>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="animate-pulse">Thinking...</span>
          </div>
        )}
      </div>

      {/* Cost estimate bar */}
      <CostEstimateBar inputTokenEstimate={inputTokenEstimate} />

      {/* Input */}
      <div className="border-t border-gray-800 px-3 py-2">
        {input.trim() && (
          <p className="mb-1 text-[10px] text-gray-600">
            ~{inputTokenEstimate} input tokens est.
          </p>
        )}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about your analysis..."
            className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:border-cyan-700 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="rounded bg-cyan-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-600 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
