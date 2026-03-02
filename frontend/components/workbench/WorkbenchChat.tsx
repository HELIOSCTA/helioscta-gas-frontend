"use client";

import { useState, useCallback } from "react";
import ContextChips from "./ContextChips";

interface WorkbenchChatProps {
  workspaceId: string;
  selectedFileIds: number[];
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function WorkbenchChat({ workspaceId, selectedFileIds }: WorkbenchChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextFileIds, setContextFileIds] = useState<number[]>(selectedFileIds);

  // Update context when selectedFileIds changes externally
  // (we let the user dismiss chips independently)

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
      // For now, use a simple fetch to the agent chat API
      // Phase D will enhance this with workspace context injection
      const res = await fetch("/api/agents", { method: "GET" });
      const data = await res.json();
      const agent = data.agents?.[0];

      if (!agent) {
        setMessages((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, role: "assistant", content: "No agent configured. Please set up an agent first." },
        ]);
        return;
      }

      // Create or use existing conversation — simplified for workbench
      const convRes = await fetch(`/api/agents/${agent.agent_id}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Workbench: ${workspaceId}` }),
      });
      const convData = await convRes.json();

      const chatRes = await fetch(`/api/agents/${agent.agent_id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ id: userMsg.id, role: "user", parts: [{ type: "text", text: input }] }],
          conversationId: convData.conversation_id,
          workspaceContext: {
            workspaceId,
            fileIds: contextFileIds,
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
  }, [input, loading, workspaceId, contextFileIds]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-800 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
          Agent Chat
        </p>
      </div>

      {/* Context chips */}
      <ContextChips
        fileIds={contextFileIds}
        onRemoveFile={(id) => setContextFileIds((prev) => prev.filter((f) => f !== id))}
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

      {/* Input */}
      <div className="border-t border-gray-800 px-3 py-2">
        {input.trim() && (
          <p className="mb-1 text-[10px] text-gray-600">
            ~{Math.ceil(input.length / 4)} input tokens est.
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
