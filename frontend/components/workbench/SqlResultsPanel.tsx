"use client";

import { useState, useEffect, useCallback } from "react";
import type { SqlRun } from "@/lib/types/analysis";
import { SQL_RUNNER_ENABLED } from "@/lib/feature-flags";

interface SqlResultsPanelProps {
  workspaceId: string;
  onRunSql?: (sqlText: string, dialect: "postgresql" | "mssql") => void;
}

const DIALECT_BADGE: Record<string, string> = {
  postgresql: "bg-blue-900/40 text-blue-300",
  mssql: "bg-purple-900/40 text-purple-300",
};

const STATUS_BADGE: Record<string, string> = {
  completed: "bg-emerald-900/40 text-emerald-300",
  failed: "bg-red-900/40 text-red-300",
  running: "bg-cyan-900/40 text-cyan-300",
};

export default function SqlResultsPanel({ workspaceId }: SqlResultsPanelProps) {
  const [sqlRuns, setSqlRuns] = useState<SqlRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const refresh = useCallback(() => {
    if (!SQL_RUNNER_ENABLED) return;
    setLoading(true);
    fetch(`/api/workspaces/${workspaceId}/sql-runs`)
      .then((r) => r.json())
      .then((data) => setSqlRuns(data.sql_runs ?? []))
      .catch((err) => console.error("Failed to fetch SQL runs:", err))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!SQL_RUNNER_ENABLED) return null;

  return (
    <div className="h-full overflow-y-auto px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-300">SQL Execution History</p>
        <button
          onClick={refresh}
          className="text-[10px] text-gray-500 hover:text-gray-400"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <p className="animate-pulse text-xs text-gray-500">Loading...</p>
      )}

      {!loading && sqlRuns.length === 0 && (
        <p className="text-xs text-gray-600">No SQL runs yet</p>
      )}

      <div className="space-y-1">
        {sqlRuns.map((run) => {
          const isExpanded = expandedId === run.sql_run_id;
          const dialectClass = DIALECT_BADGE[run.dialect] ?? "bg-gray-800 text-gray-400";
          const statusClass = STATUS_BADGE[run.status] ?? "bg-gray-800 text-gray-400";

          return (
            <div key={run.sql_run_id} className="rounded border border-gray-800 bg-[#12141d]">
              {/* Summary row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : run.sql_run_id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-gray-800/30"
              >
                <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${dialectClass}`}>
                  {run.dialect}
                </span>
                <span className="flex-1 truncate text-gray-400 font-mono text-[11px]">
                  {run.sql_text.slice(0, 60)}
                  {run.sql_text.length > 60 ? "..." : ""}
                </span>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${statusClass}`}>
                  {run.status}
                </span>
                {run.row_count != null && (
                  <span className="text-[10px] text-gray-600">{run.row_count} rows</span>
                )}
                {run.elapsed_ms != null && (
                  <span className="text-[10px] text-gray-600">{run.elapsed_ms}ms</span>
                )}
                <svg
                  className={`h-3 w-3 text-gray-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-gray-800 px-3 py-2">
                  {/* Full SQL */}
                  <div className="mb-2">
                    <p className="mb-1 text-[10px] font-semibold text-gray-500">SQL</p>
                    <pre className="overflow-x-auto rounded border border-gray-800 bg-[#0f1117] p-2 text-[11px] text-gray-300 font-mono">
                      {run.sql_text}
                    </pre>
                  </div>

                  {/* Error */}
                  {run.error_text && (
                    <div className="mb-2">
                      <p className="mb-1 text-[10px] font-semibold text-red-400">Error</p>
                      <pre className="overflow-x-auto rounded border border-red-900/50 bg-red-900/10 p-2 text-[11px] text-red-300 font-mono">
                        {run.error_text}
                      </pre>
                    </div>
                  )}

                  {/* Result table */}
                  {run.result_json && renderResultTable(run.result_json)}

                  <p className="mt-2 text-[9px] text-gray-600">
                    Run #{run.sql_run_id} &middot; {new Date(run.created_at).toLocaleString()}
                    {run.truncated && " (truncated)"}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderResultTable(resultJson: Record<string, unknown>) {
  // Result may be { columns: string[], rows: any[][] } or { rows: Record[] }
  const rows = (resultJson.rows ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return null;

  const columns = (resultJson.columns as string[]) ?? Object.keys(rows[0]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-gray-700">
            {columns.map((col) => (
              <th key={col} className="px-2 py-1 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-500">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row, ri) => (
            <tr key={ri} className="border-b border-gray-800/50">
              {columns.map((col) => (
                <td key={col} className="px-2 py-1 text-gray-400 font-mono">
                  {row[col] == null ? "—" : String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 20 && (
        <p className="mt-1 text-[9px] text-gray-600">Showing 20 of {rows.length} rows</p>
      )}
    </div>
  );
}
