"use client";

import { useState, useEffect } from "react";
import type { EvidenceLink } from "@/lib/types/analysis";
import { EVIDENCE_LINKS_ENABLED } from "@/lib/feature-flags";

interface EvidencePanelProps {
  runId: number;
  filterSectionKey?: string | null;
  onSqlRunClick?: (sqlRunId: number) => void;
  onFileClick?: (fileId: number) => void;
  onClose: () => void;
}

export default function EvidencePanel({
  runId,
  filterSectionKey,
  onSqlRunClick,
  onFileClick,
  onClose,
}: EvidencePanelProps) {
  const [links, setLinks] = useState<EvidenceLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!EVIDENCE_LINKS_ENABLED) return;
    setLoading(true);
    fetch(`/api/analysis-runs/${runId}/evidence`)
      .then((r) => r.json())
      .then((data) => setLinks(data.evidence ?? data.links ?? []))
      .catch((err) => console.error("Failed to fetch evidence:", err))
      .finally(() => setLoading(false));
  }, [runId]);

  if (!EVIDENCE_LINKS_ENABLED) return null;

  // Group by section_key
  const grouped = new Map<string, EvidenceLink[]>();
  for (const link of links) {
    if (filterSectionKey && link.section_key !== filterSectionKey) continue;
    const existing = grouped.get(link.section_key) ?? [];
    existing.push(link);
    grouped.set(link.section_key, existing);
  }

  return (
    <div className="flex h-full flex-col bg-[#0b0d14]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
        <p className="text-xs font-semibold text-gray-300">Evidence Links</p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading && (
          <p className="animate-pulse text-xs text-gray-500">Loading evidence...</p>
        )}

        {!loading && grouped.size === 0 && (
          <p className="text-xs text-gray-600">No evidence links found</p>
        )}

        {Array.from(grouped.entries()).map(([sectionKey, sectionLinks]) => (
          <div key={sectionKey} className="mb-4">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              {sectionKey.replace(/_/g, " ")}
            </p>
            <div className="space-y-2">
              {sectionLinks.map((link) => (
                <div
                  key={link.evidence_id}
                  className="rounded border border-gray-800 bg-[#12141d] p-2"
                >
                  {link.claim_text && (
                    <p className="text-xs text-gray-300">{link.claim_text}</p>
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    {link.sql_run_id && (
                      <button
                        onClick={() => onSqlRunClick?.(link.sql_run_id!)}
                        className="text-[10px] text-cyan-500 hover:text-cyan-400"
                      >
                        SQL Run #{link.sql_run_id}
                      </button>
                    )}
                    {link.workspace_file_id && (
                      <button
                        onClick={() => onFileClick?.(link.workspace_file_id!)}
                        className="text-[10px] text-cyan-500 hover:text-cyan-400"
                      >
                        File #{link.workspace_file_id}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
