"use client";

import type { PackRunStep, StepName, StepStatus } from "@/lib/types/analysis";
import { STEP_ORDER, STEP_META } from "@/lib/step-meta";

interface StepProgressBarProps {
  steps: PackRunStep[];
  onExecuteStep: (stepName: StepName) => void;
  onRetryStep: (stepName: StepName) => void;
}

function statusColor(status: StepStatus): string {
  switch (status) {
    case "completed": return "bg-emerald-500";
    case "running":   return "bg-cyan-500 animate-pulse";
    case "failed":    return "bg-red-500";
    case "skipped":   return "bg-gray-600";
    default:          return "bg-gray-700";
  }
}

function statusBorderColor(status: StepStatus): string {
  switch (status) {
    case "completed": return "border-emerald-500";
    case "running":   return "border-cyan-500";
    case "failed":    return "border-red-500";
    default:          return "border-gray-700";
  }
}

function lineColor(status: StepStatus): string {
  switch (status) {
    case "completed": return "bg-emerald-700";
    case "running":   return "bg-cyan-700";
    default:          return "bg-gray-700";
  }
}

export default function StepProgressBar({ steps, onExecuteStep, onRetryStep }: StepProgressBarProps) {
  const stepMap = new Map(steps.map((s) => [s.step_name, s]));

  return (
    <div className="flex items-center gap-0">
      {STEP_ORDER.map((stepName, i) => {
        const step = stepMap.get(stepName);
        const status: StepStatus = step?.status ?? "pending";
        const meta = STEP_META[stepName];

        // Determine if step is clickable
        const canExecute = status === "pending";
        const canRetry = status === "failed";

        const handleClick = () => {
          if (canExecute) onExecuteStep(stepName);
          else if (canRetry) onRetryStep(stepName);
        };

        return (
          <div key={stepName} className="flex items-center">
            {/* Connector line */}
            {i > 0 && (
              <div className={`h-0.5 w-6 ${lineColor(status)}`} />
            )}

            {/* Step node */}
            <button
              onClick={handleClick}
              disabled={!canExecute && !canRetry}
              title={`${meta.label}${canRetry ? " — click to retry" : canExecute ? " — click to execute" : ""}`}
              className={`relative flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all ${statusBorderColor(status)} ${
                canExecute || canRetry ? "cursor-pointer hover:scale-110" : "cursor-default"
              }`}
            >
              {/* Inner dot or icon */}
              {status === "completed" ? (
                <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : status === "failed" ? (
                <svg className="h-3 w-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 16M20 4L4 20" />
                </svg>
              ) : (
                <div className={`h-2 w-2 rounded-full ${statusColor(status)}`} />
              )}
            </button>

            {/* Label */}
            <span className={`ml-1 text-[9px] font-medium whitespace-nowrap ${
              status === "completed" ? "text-emerald-400" :
              status === "running" ? "text-cyan-400" :
              status === "failed" ? "text-red-400" :
              "text-gray-600"
            }`}>
              {meta.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
