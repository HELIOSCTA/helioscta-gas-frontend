"use client";

import { useState, useEffect } from "react";
import type { StructuredReport, MetricCardSection } from "@/lib/types/analysis";

interface RunDiffPanelProps {
  runIdA: number;
  runIdB: number;
  onClose: () => void;
}

interface MetricDiff {
  label: string;
  unit?: string;
  valueA: string;
  valueB: string;
  numericA?: number;
  numericB?: number;
  change?: number;
  changePct?: number;
  isImprovement?: boolean;
}

function extractMetrics(report: StructuredReport): MetricDiff[] {
  const metrics: MetricDiff[] = [];
  for (const section of report.sections) {
    if (section.type === "metric_card") {
      const mc = section as MetricCardSection;
      for (const m of mc.metrics) {
        metrics.push({
          label: m.label,
          unit: m.unit,
          valueA: m.value,
          valueB: m.value,
          numericA: m.value_numeric,
          numericB: m.value_numeric,
        });
      }
    }
  }
  return metrics;
}

function computeDiffs(metricsA: MetricDiff[], metricsB: MetricDiff[]): MetricDiff[] {
  const mapB = new Map(metricsB.map((m) => [m.label, m]));
  return metricsA.map((a) => {
    const b = mapB.get(a.label);
    if (!b) return a;

    const numA = a.numericA;
    const numB = b.numericB;
    let change: number | undefined;
    let changePct: number | undefined;
    let isImprovement: boolean | undefined;

    if (numA != null && numB != null) {
      change = numB - numA;
      if (numA !== 0) changePct = (change / Math.abs(numA)) * 100;
      isImprovement = change > 0; // positive = improvement (simplified)
    }

    return {
      label: a.label,
      unit: a.unit,
      valueA: a.valueA,
      valueB: b.valueB ?? b.valueA,
      numericA: numA,
      numericB: numB,
      change,
      changePct,
      isImprovement,
    };
  });
}

export default function RunDiffPanel({ runIdA, runIdB, onClose }: RunDiffPanelProps) {
  const [reportA, setReportA] = useState<StructuredReport | null>(null);
  const [reportB, setReportB] = useState<StructuredReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/analysis-runs/${runIdA}/report`).then((r) => r.json()),
      fetch(`/api/analysis-runs/${runIdB}/report`).then((r) => r.json()),
    ])
      .then(([a, b]) => {
        setReportA(a.report ?? a);
        setReportB(b.report ?? b);
      })
      .catch((err) => console.error("Failed to fetch reports for diff:", err))
      .finally(() => setLoading(false));
  }, [runIdA, runIdB]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="animate-pulse text-xs text-gray-500">Loading comparison...</span>
      </div>
    );
  }

  if (!reportA || !reportB) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-gray-600">Could not load reports for comparison</p>
      </div>
    );
  }

  const metricsA = extractMetrics(reportA);
  const metricsB = extractMetrics(reportB);
  const diffs = computeDiffs(metricsA, metricsB);

  return (
    <div className="h-full overflow-y-auto px-6 py-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">Run Comparison</h2>
          <p className="text-[10px] text-gray-500">
            Run #{runIdA} ({reportA.trade_date}) vs Run #{runIdB} ({reportB.trade_date})
          </p>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Signal comparison */}
      <div className="mb-4 flex items-center gap-4">
        <div className="rounded border border-gray-700 bg-[#12141d] px-3 py-2">
          <p className="text-[9px] text-gray-500">Run #{runIdA}</p>
          <p className="text-xs font-medium text-gray-300">{reportA.overall_signal}</p>
        </div>
        <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
        <div className="rounded border border-gray-700 bg-[#12141d] px-3 py-2">
          <p className="text-[9px] text-gray-500">Run #{runIdB}</p>
          <p className="text-xs font-medium text-gray-300">{reportB.overall_signal}</p>
        </div>
      </div>

      {/* KPI delta table */}
      {diffs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">Metric</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">Run #{runIdA}</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">Run #{runIdB}</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">Change</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((d, i) => (
                <tr key={i} className="border-b border-gray-800/50">
                  <td className="px-3 py-1.5 text-gray-300">
                    {d.label}
                    {d.unit && <span className="ml-1 text-gray-600">({d.unit})</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right text-gray-400 font-mono">{d.valueA}</td>
                  <td className="px-3 py-1.5 text-right text-gray-400 font-mono">{d.valueB}</td>
                  <td className={`px-3 py-1.5 text-right font-mono ${
                    d.isImprovement === true ? "text-emerald-400" :
                    d.isImprovement === false ? "text-red-400" :
                    "text-gray-500"
                  }`}>
                    {d.change != null ? (
                      <>
                        {d.change > 0 ? "+" : ""}{d.change.toFixed(2)}
                        {d.changePct != null && (
                          <span className="ml-1 text-[10px]">
                            ({d.changePct > 0 ? "+" : ""}{d.changePct.toFixed(1)}%)
                          </span>
                        )}
                      </>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {diffs.length === 0 && (
        <p className="text-xs text-gray-600">No metric cards found in reports to compare</p>
      )}
    </div>
  );
}
