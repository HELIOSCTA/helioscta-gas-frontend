"use client";

import { useState, useEffect } from "react";
import { COST_DISPLAY_ENABLED } from "@/lib/feature-flags";

interface CostStats {
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  daily_budget_usd: number;
  daily_spent_usd: number;
}

interface CostEstimateBarProps {
  inputTokenEstimate: number;
}

export default function CostEstimateBar({ inputTokenEstimate }: CostEstimateBarProps) {
  const [stats, setStats] = useState<CostStats | null>(null);

  useEffect(() => {
    if (!COST_DISPLAY_ENABLED) return;
    fetch("/api/agents/cost-stats")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

  if (!COST_DISPLAY_ENABLED || !stats || stats.daily_spent_usd == null || stats.daily_budget_usd == null) return null;

  const remaining = stats.daily_budget_usd - stats.daily_spent_usd;
  const isHighCost = inputTokenEstimate > 4000;
  const isNearBudget = remaining < stats.daily_budget_usd * 0.1;

  return (
    <div className="flex items-center gap-3 border-t border-gray-800 px-3 py-1">
      <span className="text-[10px] text-gray-600">
        ~{inputTokenEstimate.toLocaleString()} tokens
      </span>
      <span className="text-[10px] text-gray-600">
        ${stats.daily_spent_usd.toFixed(2)} / ${stats.daily_budget_usd.toFixed(2)} today
      </span>
      {(isHighCost || isNearBudget) && (
        <span className="text-[10px] font-medium text-amber-400">
          {isNearBudget ? "Near budget limit" : "High token count"}
        </span>
      )}
    </div>
  );
}
