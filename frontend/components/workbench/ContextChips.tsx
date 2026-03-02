"use client";

interface ContextChipsProps {
  fileIds: number[];
  onRemoveFile: (fileId: number) => void;
}

export default function ContextChips({ fileIds, onRemoveFile }: ContextChipsProps) {
  if (fileIds.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 px-3 py-1 border-b border-gray-800">
      {fileIds.map((id) => (
        <span
          key={id}
          className="inline-flex items-center gap-1 rounded-full bg-cyan-900/40 px-2 py-0.5 text-[10px] text-cyan-300"
        >
          File #{id}
          <button
            onClick={() => onRemoveFile(id)}
            className="ml-0.5 text-cyan-500 hover:text-cyan-300"
            title="Remove from context"
          >
            &times;
          </button>
        </span>
      ))}
    </div>
  );
}
