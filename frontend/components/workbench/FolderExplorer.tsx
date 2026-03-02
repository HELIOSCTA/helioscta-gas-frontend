"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import type { WorkspaceFile } from "@/components/workspace/FileTree";

interface FolderExplorerProps {
  files: WorkspaceFile[];
  selectedFileId: number | null;
  onSelectFile: (file: WorkspaceFile) => void;
  onCreateFile: (fileName: string, parentPath: string) => void;
  onUploadFile: (fileName: string, content: string, parentPath: string) => void;
  onDeleteFile: (fileId: number) => void;
}

const FOLDERS = ["skills", "datasets", "visualizations", "models", "reports"] as const;

const FILE_ICONS: Record<string, { color: string; label: string }> = {
  md: { color: "text-blue-400", label: "MD" },
  csv: { color: "text-green-400", label: "CSV" },
  py: { color: "text-yellow-400", label: "PY" },
  sql: { color: "text-orange-400", label: "SQL" },
  png: { color: "text-pink-400", label: "IMG" },
  svg: { color: "text-pink-400", label: "SVG" },
  json: { color: "text-purple-400", label: "JSON" },
  txt: { color: "text-gray-400", label: "TXT" },
};

function FileIcon({ fileType }: { fileType: string }) {
  const info = FILE_ICONS[fileType] ?? { color: "text-gray-500", label: "?" };
  return (
    <span
      className={`inline-flex h-5 w-7 items-center justify-center rounded text-[9px] font-bold ${info.color} bg-gray-800/60`}
    >
      {info.label}
    </span>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-3 w-3 flex-shrink-0 text-gray-500 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function FileRow({
  file,
  selected,
  onSelect,
  onDelete,
}: {
  file: WorkspaceFile;
  selected: boolean;
  onSelect: (file: WorkspaceFile) => void;
  onDelete: (fileId: number) => void;
}) {
  return (
    <div className="group relative">
      <button
        onClick={() => onSelect(file)}
        className={`flex w-full items-center gap-2 py-1.5 pl-8 pr-3 text-left text-xs transition-colors ${
          selected
            ? "bg-gray-800/60 text-gray-200"
            : "text-gray-400 hover:bg-gray-800/30 hover:text-gray-300"
        }`}
      >
        <FileIcon fileType={file.file_type} />
        <span className="truncate">{file.file_name}</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(file.file_id);
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
        title="Delete file"
      >
        <svg
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default function FolderExplorer({
  files,
  selectedFileId,
  onSelectFile,
  onCreateFile,
  onUploadFile,
  onDeleteFile,
}: FolderExplorerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(FOLDERS));
  const [newFileFolder, setNewFileFolder] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploadFolder, setUploadFolder] = useState<string>("");

  // Group files by folder
  const grouped = useMemo(() => {
    const map: Record<string, WorkspaceFile[]> = {};
    for (const folder of FOLDERS) {
      map[folder] = [];
    }
    const other: WorkspaceFile[] = [];

    for (const file of files) {
      const parent = (file.parent_path || "").replace(/^\/|\/$/g, "");
      const topFolder = parent.split("/")[0];
      if (topFolder && (FOLDERS as readonly string[]).includes(topFolder)) {
        map[topFolder].push(file);
      } else {
        other.push(file);
      }
    }
    return { folders: map, other };
  }, [files]);

  const toggleFolder = useCallback((folder: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  }, []);

  const handleCreate = (folder: string) => {
    const name = newFileName.trim();
    if (!name) return;
    onCreateFile(name, folder);
    setNewFileName("");
    setNewFileFolder(null);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onUploadFile(file.name, reader.result as string, uploadFolder);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-800 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Explorer
        </p>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {FOLDERS.map((folder) => {
          const isOpen = expanded.has(folder);
          const folderFiles = grouped.folders[folder];

          return (
            <div key={folder}>
              {/* Folder header */}
              <div className="flex items-center">
                <button
                  onClick={() => toggleFolder(folder)}
                  className="flex flex-1 items-center gap-1.5 py-1.5 pl-2 text-left transition-colors hover:bg-gray-800/30"
                >
                  <Chevron expanded={isOpen} />
                  <span className="text-sm font-bold text-gray-300">
                    {folder}/
                  </span>
                  <span className="text-[9px] text-gray-600">
                    {folderFiles.length}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setNewFileFolder(newFileFolder === folder ? null : folder);
                    setNewFileName("");
                  }}
                  className="px-2 py-1 text-gray-600 transition-colors hover:text-gray-300"
                  title={`New file in ${folder}/`}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setUploadFolder(folder);
                    uploadRef.current?.click();
                  }}
                  className="px-2 py-1 text-gray-600 transition-colors hover:text-gray-300"
                  title={`Upload to ${folder}/`}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
                  </svg>
                </button>
              </div>

              {/* New file input for this folder */}
              {newFileFolder === folder && (
                <div className="px-3 py-1">
                  <input
                    autoFocus
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate(folder);
                      if (e.key === "Escape") setNewFileFolder(null);
                    }}
                    onBlur={() => {
                      if (!newFileName.trim()) setNewFileFolder(null);
                    }}
                    placeholder="filename.md"
                    className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:border-gray-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Files */}
              {isOpen &&
                folderFiles.map((file) => (
                  <FileRow
                    key={file.file_id}
                    file={file}
                    selected={selectedFileId === file.file_id}
                    onSelect={onSelectFile}
                    onDelete={onDeleteFile}
                  />
                ))}
            </div>
          );
        })}

        {/* Other files (not in any standard folder) */}
        {grouped.other.length > 0 && (
          <div>
            <div className="flex items-center">
              <button
                onClick={() => toggleFolder("__other__")}
                className="flex flex-1 items-center gap-1.5 py-1.5 pl-2 text-left transition-colors hover:bg-gray-800/30"
              >
                <Chevron expanded={expanded.has("__other__")} />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Other
                </span>
                <span className="text-[9px] text-gray-600">
                  {grouped.other.length}
                </span>
              </button>
            </div>
            {expanded.has("__other__") &&
              grouped.other.map((file) => (
                <FileRow
                  key={file.file_id}
                  file={file}
                  selected={selectedFileId === file.file_id}
                  onSelect={onSelectFile}
                  onDelete={onDeleteFile}
                />
              ))}
          </div>
        )}
      </div>

      {/* Hidden upload input */}
      <input
        ref={uploadRef}
        type="file"
        className="hidden"
        accept=".md,.csv,.py,.sql,.json,.txt,.png,.svg"
        onChange={handleUpload}
      />
    </div>
  );
}
