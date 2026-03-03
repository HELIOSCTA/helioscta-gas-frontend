"use client";

import { useState, useEffect } from "react";

interface Agent {
  agent_id: number;
  display_name: string;
  model_id: string;
}

interface AgentSelectorProps {
  selectedAgentId: number | null;
  onSelect: (agentId: number) => void;
}

export default function AgentSelector({ selectedAgentId, onSelect }: AgentSelectorProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        const list = data.agents ?? [];
        setAgents(list);
        // Auto-select first agent if none selected
        if (!selectedAgentId && list.length > 0) {
          onSelect(list[0].agent_id);
        }
      })
      .catch((err) => console.error("Failed to fetch agents:", err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = agents.find((a) => a.agent_id === selectedAgentId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs text-gray-300 hover:border-gray-600 hover:text-gray-200"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {selected?.display_name ?? "Select Agent"}
        <svg className="h-3 w-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded border border-gray-700 bg-[#12141d] shadow-lg">
          {agents.map((agent) => (
            <button
              key={agent.agent_id}
              onClick={() => { onSelect(agent.agent_id); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-gray-800/60 ${
                agent.agent_id === selectedAgentId ? "text-cyan-300" : "text-gray-400"
              }`}
            >
              <span className="truncate">{agent.display_name}</span>
              <span className="ml-auto text-[9px] text-gray-600">{agent.model_id}</span>
            </button>
          ))}
          {agents.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-600">No agents found</p>
          )}
        </div>
      )}
    </div>
  );
}
