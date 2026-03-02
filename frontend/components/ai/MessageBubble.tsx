"use client";

import { useState } from "react";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  userEmail?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostUsd?: number | null;
}

function formatTime(ts?: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

interface SaveModalProps {
  content: string;
  onClose: () => void;
}

function SaveToWorkspaceModal({ content, onClose }: SaveModalProps) {
  const [workspaces, setWorkspaces] = useState<
    { workspace_id: number; display_name: string }[]
  >([]);
  const [selectedWsId, setSelectedWsId] = useState<number | null>(null);
  const [fileName, setFileName] = useState(
    `response_${new Date().toISOString().slice(0, 10)}.md`
  );
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Fetch workspaces on mount
  if (!loaded) {
    setLoaded(true);
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((data) => {
        const ws = data.workspaces ?? [];
        setWorkspaces(ws);
        if (ws.length > 0) setSelectedWsId(ws[0].workspace_id);
      })
      .catch((err) => console.error("Failed to fetch workspaces:", err));
  }

  const handleSave = async () => {
    if (!selectedWsId || !fileName.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/workspaces/${selectedWsId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: fileName.trim(),
          content,
          source: "agent_output",
        }),
      });
      onClose();
    } catch (err) {
      console.error("Failed to save to workspace:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-96 rounded-lg border border-gray-700 bg-[#12141d] p-4 shadow-xl">
        <h3 className="mb-3 text-sm font-medium text-gray-200">
          Save to Workspace
        </h3>
        <div className="mb-3">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Workspace
          </label>
          <select
            value={selectedWsId ?? ""}
            onChange={(e) => setSelectedWsId(Number(e.target.value))}
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 focus:border-gray-500 focus:outline-none"
          >
            {workspaces.map((ws) => (
              <option key={ws.workspace_id} value={ws.workspace_id}>
                {ws.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-4">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
            File Name
          </label>
          <input
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:border-gray-500 focus:outline-none"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !selectedWsId}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MessageBubble({
  role,
  content,
  timestamp,
  userEmail,
  inputTokens,
  outputTokens,
  estimatedCostUsd,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const [showSaveModal, setShowSaveModal] = useState(false);

  return (
    <>
      <div className={`group flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[80%] rounded-lg px-4 py-3 ${
            isUser
              ? "bg-blue-600/20 border border-blue-500/30"
              : "bg-[#12141d] border border-gray-800"
          }`}
        >
          <div className="mb-1 flex items-center gap-2">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                isUser ? "text-blue-400" : "text-cyan-400"
              }`}
            >
              {isUser ? "You" : "Assistant"}
            </span>
            {userEmail && (
              <span className="text-[10px] text-gray-600">{userEmail}</span>
            )}
            {timestamp && (
              <span className="text-[10px] text-gray-600">
                {formatTime(timestamp)}
              </span>
            )}
            {!isUser && estimatedCostUsd != null && estimatedCostUsd > 0 && (
              <span
                className="text-[10px] text-gray-600 cursor-help"
                title={`Input: ${inputTokens?.toLocaleString() ?? "?"} tokens | Output: ${outputTokens?.toLocaleString() ?? "?"} tokens`}
              >
                ${estimatedCostUsd < 0.01 ? estimatedCostUsd.toFixed(4) : estimatedCostUsd.toFixed(2)}
              </span>
            )}
            {!isUser && (
              <button
                onClick={() => setShowSaveModal(true)}
                className="ml-auto rounded p-0.5 text-gray-600 opacity-0 transition-opacity hover:text-emerald-400 group-hover:opacity-100"
                title="Save to workspace"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
              </button>
            )}
          </div>
          <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
            {content}
          </div>
        </div>
      </div>
      {showSaveModal && (
        <SaveToWorkspaceModal
          content={content}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </>
  );
}
