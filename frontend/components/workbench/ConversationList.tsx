"use client";

import { useState, useEffect, useCallback } from "react";

interface Conversation {
  conversation_id: number;
  title: string;
  created_at: string;
}

interface ConversationListProps {
  agentId: number | null;
  activeConversationId: number | null;
  onSelect: (conversationId: number) => void;
  onNewConversation: () => void;
}

export default function ConversationList({
  agentId,
  activeConversationId,
  onSelect,
  onNewConversation,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [collapsed, setCollapsed] = useState(true);

  const refresh = useCallback(() => {
    if (!agentId) return;
    fetch(`/api/agents/${agentId}/conversations`)
      .then((r) => r.json())
      .then((data) => setConversations(data.conversations ?? []))
      .catch((err) => console.error("Failed to fetch conversations:", err));
  }, [agentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!agentId) return null;

  return (
    <div className="border-b border-gray-800">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-400"
      >
        <span>Conversations</span>
        <svg
          className={`h-3 w-3 transition-transform ${collapsed ? "" : "rotate-180"}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {!collapsed && (
        <div className="max-h-40 overflow-y-auto px-1 pb-1.5">
          <button
            onClick={onNewConversation}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-cyan-400 hover:bg-cyan-900/20"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Conversation
          </button>
          {conversations.map((conv) => (
            <button
              key={conv.conversation_id}
              onClick={() => onSelect(conv.conversation_id)}
              className={`flex w-full items-center rounded px-2 py-1 text-left text-xs transition-colors ${
                conv.conversation_id === activeConversationId
                  ? "bg-gray-800/60 text-gray-200"
                  : "text-gray-500 hover:bg-gray-800/30 hover:text-gray-400"
              }`}
            >
              <span className="truncate">{conv.title || `Chat ${conv.conversation_id}`}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
