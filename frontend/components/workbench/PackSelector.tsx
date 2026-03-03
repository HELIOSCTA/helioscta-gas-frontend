"use client";

import { useState, useEffect, useRef } from "react";
import type { AnalysisPack } from "@/lib/types/analysis";
import { ANALYSIS_PACKS_ENABLED } from "@/lib/feature-flags";

interface PackSelectorProps {
  workspaceId: string;
  activePackId: number | null;
  onSelect: (packId: number) => void;
}

const STATUS_BADGE: Record<string, string> = {
  completed: "bg-emerald-900/60 text-emerald-300",
  running: "bg-cyan-900/60 text-cyan-300",
  failed: "bg-red-900/60 text-red-300",
  default: "bg-gray-800 text-gray-400",
};

export default function PackSelector({ workspaceId, activePackId, onSelect }: PackSelectorProps) {
  const [packs, setPacks] = useState<(AnalysisPack & { latest_run_status?: string })[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ANALYSIS_PACKS_ENABLED) return;
    fetch("/api/analysis-packs")
      .then((r) => r.json())
      .then((data) => {
        const list = (data.packs ?? []).filter(
          (p: AnalysisPack) => String(p.workspace_id) === workspaceId
        );
        setPacks(list);
      })
      .catch((err) => console.error("Failed to fetch packs:", err));
  }, [workspaceId]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/analysis-packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: Number(workspaceId),
          slug: name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
          display_name: name,
        }),
      });
      const data = await res.json();
      if (data.pack_id) {
        onSelect(data.pack_id);
        setNewName("");
        setCreating(false);
        setOpen(false);
        // Refresh packs
        const refreshRes = await fetch("/api/analysis-packs");
        const refreshData = await refreshRes.json();
        setPacks(
          (refreshData.packs ?? []).filter(
            (p: AnalysisPack) => String(p.workspace_id) === workspaceId
          )
        );
      }
    } catch (err) {
      console.error("Failed to create pack:", err);
    }
  };

  if (!ANALYSIS_PACKS_ENABLED) return null;

  const selected = packs.find((p) => p.pack_id === activePackId);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded border border-gray-700 bg-gray-900 px-3 py-1 text-xs text-gray-300 hover:border-gray-600"
      >
        <svg className="h-3.5 w-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
        {selected ? selected.display_name : "Select Pack"}
        <svg className="h-3 w-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded border border-gray-700 bg-[#12141d] shadow-lg">
          {packs.map((pack) => {
            const badgeClass = STATUS_BADGE[pack.latest_run_status ?? ""] ?? STATUS_BADGE.default;
            return (
              <button
                key={pack.pack_id}
                onClick={() => { onSelect(pack.pack_id); setOpen(false); }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-gray-800/60 ${
                  pack.pack_id === activePackId ? "text-cyan-300" : "text-gray-400"
                }`}
              >
                <span className="truncate">{pack.display_name}</span>
                {pack.latest_run_status && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${badgeClass}`}>
                    {pack.latest_run_status}
                  </span>
                )}
              </button>
            );
          })}

          {packs.length === 0 && !creating && (
            <p className="px-3 py-2 text-xs text-gray-600">No packs in this workspace</p>
          )}

          <div className="border-t border-gray-700">
            {creating ? (
              <div className="flex items-center gap-1 p-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setCreating(false); setNewName(""); }
                  }}
                  placeholder="Pack name"
                  className="flex-1 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:border-cyan-700 focus:outline-none"
                />
                <button
                  onClick={handleCreate}
                  className="rounded bg-cyan-700 px-2 py-1 text-xs text-white hover:bg-cyan-600"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-cyan-400 hover:bg-cyan-900/20"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Create Pack
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
