"use client";

import { useState } from "react";
import type { SavedReportRow } from "@/lib/types/report";

interface ReportHistoryProps {
  reports: SavedReportRow[];
  onLoadReport: (reportId: number) => void;
}

export default function ReportHistory({ reports, onLoadReport }: ReportHistoryProps) {
  const [open, setOpen] = useState(false);

  if (reports.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200"
      >
        History ({reports.length})
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-gray-700 bg-[#12141d] shadow-xl">
            <div className="border-b border-gray-800 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Saved Reports
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {reports.map((r) => (
                <button
                  key={r.report_id}
                  onClick={() => {
                    onLoadReport(r.report_id);
                    setOpen(false);
                  }}
                  className="flex w-full flex-col gap-0.5 border-b border-gray-800/50 px-3 py-2.5 text-left transition-colors hover:bg-gray-800/40"
                >
                  <span className="text-xs font-medium text-gray-200 line-clamp-1">
                    {r.title}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">
                      {r.trade_date}
                    </span>
                    {r.overall_signal && (
                      <span
                        className={`text-[10px] font-medium ${
                          r.overall_signal === "bullish"
                            ? "text-emerald-400"
                            : r.overall_signal === "bearish"
                            ? "text-red-400"
                            : "text-gray-400"
                        }`}
                      >
                        {r.overall_signal}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-600">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
