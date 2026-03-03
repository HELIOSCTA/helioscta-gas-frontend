"use client";

import { useState, useEffect } from "react";
import type { PackRun } from "@/lib/types/analysis";
import { RUN_DIFF_ENABLED } from "@/lib/feature-flags";

interface RunHistoryProps {
  packId: number | null;
  activeRunId: number | null;
  onSelectRun: (runId: number) => void;
  onCompareRuns?: (runIdA: number, runIdB: number) => void;
}

const STATUS_DOT: Record<string, string> = {
  completed: "bg-emerald-500",
  running: "bg-cyan-500 animate-pulse",
  failed: "bg-red-500",
  finalized: "bg-purple-500",
  pending: "bg-gray-500",
};

export default function RunHistory({ packId, activeRunId, onSelectRun, onCompareRuns }: RunHistoryProps) {
  const [runs, setRuns] = useState<PackRun[]>([]);
  const [open, setOpen] = useState(false);
  const [compareSelection, setCompareSelection] = useState<number[]>([]);

  useEffect(() => {
    if (!packId) { setRuns([]); return; }
    fetch(`/api/analysis-packs/${packId}`)
      .then((r) => r.json())
      .then((data) => setRuns(data.runs ?? data.recent_runs ?? []))
      .catch((err) => console.error("Failed to fetch run history:", err));
  }, [packId]);

  const toggleCompare = (runId: number) => {
    setCompareSelection((prev) => {
      if (prev.includes(runId)) return prev.filter((id) => id !== runId);
      if (prev.length >= 2) return [prev[1], runId]; // Keep last 2
      return [...prev, runId];
    });
  };

  if (!packId) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-800/40 hover:text-gray-400"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        History ({runs.length})
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded border border-gray-700 bg-[#12141d] shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-700 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              Run History
            </p>
            {RUN_DIFF_ENABLED && onCompareRuns && compareSelection.length === 2 && (
              <button
                onClick={() => {
                  onCompareRuns(compareSelection[0], compareSelection[1]);
                  setOpen(false);
                  setCompareSelection([]);
                }}
                className="rounded bg-cyan-700 px-2 py-0.5 text-[9px] font-medium text-white hover:bg-cyan-600"
              >
                Compare
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {runs.length === 0 && (
              <p className="px-3 py-3 text-xs text-gray-600">No runs yet</p>
            )}
            {runs.map((run) => (
              <div
                key={run.run_id}
                className={`flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-gray-800/60 ${
                  run.run_id === activeRunId ? "bg-gray-800/40" : ""
                }`}
              >
                {/* Compare checkbox */}
                {RUN_DIFF_ENABLED && onCompareRuns && (
                  <input
                    type="checkbox"
                    checked={compareSelection.includes(run.run_id)}
                    onChange={() => toggleCompare(run.run_id)}
                    className="h-3 w-3 rounded border-gray-600 bg-gray-800 accent-cyan-600"
                  />
                )}
                <button
                  onClick={() => { onSelectRun(run.run_id); setOpen(false); }}
                  className={`flex flex-1 items-center gap-2 text-left ${
                    run.run_id === activeRunId ? "text-gray-200" : "text-gray-400"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[run.status] ?? STATUS_DOT.pending}`} />
                  <span className="flex-1 truncate">
                    Run #{run.run_id}
                    {run.trade_date && (
                      <span className="ml-1 text-gray-600">({run.trade_date})</span>
                    )}
                  </span>
                  <span className="text-[9px] text-gray-600">
                    {new Date(run.started_at).toLocaleDateString()}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
