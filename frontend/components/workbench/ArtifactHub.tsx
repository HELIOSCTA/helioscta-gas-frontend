"use client";

import { useState, useEffect } from "react";
import type { ReportArtifact } from "@/lib/types/analysis";

interface ArtifactHubProps {
  runId: number;
  onClose: () => void;
  onFileClick?: (fileId: number) => void;
}

const TYPE_ICONS: Record<string, { label: string; color: string }> = {
  report_json: { label: "JSON", color: "text-purple-400" },
  report_md: { label: "MD", color: "text-blue-400" },
  report_html: { label: "HTML", color: "text-orange-400" },
  csv: { label: "CSV", color: "text-green-400" },
  evidence: { label: "EVD", color: "text-cyan-400" },
};

export default function ArtifactHub({ runId, onClose, onFileClick }: ArtifactHubProps) {
  const [artifacts, setArtifacts] = useState<ReportArtifact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analysis-runs/${runId}/artifacts`)
      .then((r) => r.json())
      .then((data) => setArtifacts(data.artifacts ?? []))
      .catch((err) => console.error("Failed to fetch artifacts:", err))
      .finally(() => setLoading(false));
  }, [runId]);

  // Group by artifact_type
  const grouped = new Map<string, ReportArtifact[]>();
  for (const art of artifacts) {
    const existing = grouped.get(art.artifact_type) ?? [];
    existing.push(art);
    grouped.set(art.artifact_type, existing);
  }

  return (
    <div className="flex h-full flex-col bg-[#0b0d14]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
        <p className="text-xs font-semibold text-gray-300">Artifacts</p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading && (
          <p className="animate-pulse text-xs text-gray-500">Loading artifacts...</p>
        )}

        {!loading && artifacts.length === 0 && (
          <p className="text-xs text-gray-600">No artifacts generated yet</p>
        )}

        {Array.from(grouped.entries()).map(([type, typeArtifacts]) => {
          const meta = TYPE_ICONS[type] ?? { label: type.toUpperCase(), color: "text-gray-400" };

          return (
            <div key={type} className="mb-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {type.replace(/_/g, " ")}
              </p>
              <div className="space-y-1">
                {typeArtifacts.map((art) => (
                  <div
                    key={art.artifact_id}
                    className="flex items-center gap-2 rounded border border-gray-800 bg-[#12141d] px-3 py-2"
                  >
                    <span className={`text-[10px] font-bold ${meta.color}`}>{meta.label}</span>
                    <span className="flex-1 truncate text-xs text-gray-400">
                      {art.blob_path?.split("/").pop() ?? `Artifact #${art.artifact_id}`}
                    </span>
                    <div className="flex items-center gap-1">
                      {art.workspace_file_id && onFileClick && (
                        <button
                          onClick={() => onFileClick(art.workspace_file_id!)}
                          className="rounded px-1.5 py-0.5 text-[10px] text-cyan-500 hover:bg-cyan-900/20 hover:text-cyan-400"
                          title="View in editor"
                        >
                          View
                        </button>
                      )}
                      {art.blob_path && (
                        <a
                          href={art.blob_path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-800 hover:text-gray-400"
                          title="Download"
                        >
                          Download
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
