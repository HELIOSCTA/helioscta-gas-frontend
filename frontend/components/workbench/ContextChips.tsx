"use client";

interface FileContext {
  fileId: number;
  fileName?: string;
  fileType?: string;
  sizeBytes?: number | null;
}

interface ContextChipsProps {
  files: FileContext[];
  onRemoveFile: (fileId: number) => void;
}

const TYPE_BADGE: Record<string, string> = {
  md: "bg-blue-900/40 text-blue-300",
  csv: "bg-green-900/40 text-green-300",
  py: "bg-yellow-900/40 text-yellow-300",
  sql: "bg-orange-900/40 text-orange-300",
  json: "bg-purple-900/40 text-purple-300",
  txt: "bg-gray-800 text-gray-400",
};

function estimateTokens(sizeBytes?: number | null): number {
  // ~1 token per 4 bytes for text content
  return sizeBytes ? Math.ceil(sizeBytes / 4) : 0;
}

export default function ContextChips({ files, onRemoveFile }: ContextChipsProps) {
  if (files.length === 0) return null;

  const totalTokens = files.reduce((sum, f) => sum + estimateTokens(f.sizeBytes), 0);
  const isOverBudget = totalTokens > 2500;

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1 border-b border-gray-800">
      {files.map((f) => {
        const badgeClass = TYPE_BADGE[f.fileType ?? ""] ?? "bg-gray-800 text-gray-500";
        return (
          <span
            key={f.fileId}
            className="inline-flex items-center gap-1 rounded-full bg-cyan-900/40 px-2 py-0.5 text-[10px] text-cyan-300"
          >
            {f.fileType && (
              <span className={`rounded px-1 py-px text-[8px] font-bold uppercase ${badgeClass}`}>
                {f.fileType}
              </span>
            )}
            {f.fileName ?? `File #${f.fileId}`}
            {f.sizeBytes != null && (
              <span className="text-cyan-500/60">~{estimateTokens(f.sizeBytes)}t</span>
            )}
            <button
              onClick={() => onRemoveFile(f.fileId)}
              className="ml-0.5 text-cyan-500 hover:text-cyan-300"
              title="Remove from context"
            >
              &times;
            </button>
          </span>
        );
      })}
      <span className={`text-[9px] ${isOverBudget ? "font-medium text-amber-400" : "text-gray-600"}`}>
        {totalTokens.toLocaleString()} tokens{isOverBudget ? " (over budget)" : ""}
      </span>
    </div>
  );
}
