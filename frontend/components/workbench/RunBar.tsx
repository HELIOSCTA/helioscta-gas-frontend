"use client";

import { useState, useCallback } from "react";
import type { StepName } from "@/lib/types/analysis";
import { useRunPoller } from "@/lib/hooks/useRunPoller";
import StepProgressBar from "./StepProgressBar";

interface RunBarProps {
  activePackId: number | null;
  activeRunId: number | null;
  onRunCreated: (runId: number) => void;
}

const RUN_STATUS_BADGE: Record<string, string> = {
  pending: "bg-gray-800 text-gray-400",
  running: "bg-cyan-900/60 text-cyan-300",
  completed: "bg-emerald-900/60 text-emerald-300",
  failed: "bg-red-900/60 text-red-300",
  finalized: "bg-purple-900/60 text-purple-300",
};

export default function RunBar({ activePackId, activeRunId, onRunCreated }: RunBarProps) {
  const [tradeDate, setTradeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [starting, setStarting] = useState(false);
  const { run, steps, isPolling } = useRunPoller(activeRunId);

  const handleStartRun = useCallback(async () => {
    if (!activePackId) return;
    setStarting(true);
    try {
      const res = await fetch(`/api/analysis-packs/${activePackId}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trade_date: tradeDate }),
      });
      const data = await res.json();
      if (data.run_id) {
        onRunCreated(data.run_id);
      }
    } catch (err) {
      console.error("Failed to start run:", err);
    } finally {
      setStarting(false);
    }
  }, [activePackId, tradeDate, onRunCreated]);

  const handleExecuteStep = useCallback(async (stepName: StepName) => {
    if (!activeRunId) return;
    try {
      await fetch(`/api/analysis-runs/${activeRunId}/execute-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_name: stepName }),
      });
    } catch (err) {
      console.error("Step execution error:", err);
    }
  }, [activeRunId]);

  const handleRetryStep = useCallback(async (stepName: StepName) => {
    if (!activeRunId) return;
    try {
      await fetch(`/api/analysis-runs/${activeRunId}/retry-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_name: stepName }),
      });
    } catch (err) {
      console.error("Step retry error:", err);
    }
  }, [activeRunId]);

  if (!activePackId) return null;

  const runStatus = run?.status ?? null;
  const badgeClass = RUN_STATUS_BADGE[runStatus ?? ""] ?? RUN_STATUS_BADGE.pending;

  return (
    <div className="flex items-center gap-3 border-b border-gray-800 bg-[#0b0d14] px-4 py-1.5">
      {/* Trade date + start */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={tradeDate}
          onChange={(e) => setTradeDate(e.target.value)}
          className="rounded border border-gray-700 bg-gray-900 px-2 py-0.5 text-xs text-gray-300 focus:border-cyan-700 focus:outline-none"
        />
        <button
          onClick={handleStartRun}
          disabled={starting || !activePackId}
          className="rounded bg-cyan-700 px-3 py-1 text-xs font-medium text-white hover:bg-cyan-600 disabled:opacity-50"
        >
          {starting ? "Starting..." : "Start Run"}
        </button>
      </div>

      {/* Run status badge */}
      {runStatus && (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass}`}>
          {runStatus}
          {isPolling && (
            <span className="ml-1 inline-block h-1 w-1 animate-pulse rounded-full bg-current" />
          )}
        </span>
      )}

      {/* Step progress bar */}
      {activeRunId && steps.length > 0 && (
        <div className="ml-auto overflow-x-auto">
          <StepProgressBar
            steps={steps}
            onExecuteStep={handleExecuteStep}
            onRetryStep={handleRetryStep}
          />
        </div>
      )}
    </div>
  );
}
