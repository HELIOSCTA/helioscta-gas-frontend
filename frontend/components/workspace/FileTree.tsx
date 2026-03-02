"use client";

import { useState, useRef, useMemo, useCallback } from "react";

export interface WorkspaceFile {
  file_id: number;
  file_name: string;
  file_type: string;
  blob_path: string;
  parent_path: string;
  size_bytes: number | null;
  source: string;
  updated_at: string;
}

interface FileTreeProps {
  files: WorkspaceFile[];
  selectedFileId: number | null;
  onSelectFile: (file: WorkspaceFile) => void;
  onCreateFile: (fileName: string) => void;
  onUploadFile: (fileName: string, content: string) => void;
  onDeleteFile: (fileId: number) => void;
}

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

/* ── Tree data structure ───────────────────────────────────── */

interface TreeNode {
  name: string;
  fullPath: string;
  files: WorkspaceFile[];
  children: Map<string, TreeNode>;
}

function buildTree(files: WorkspaceFile[]): TreeNode {
  const root: TreeNode = { name: "", fullPath: "", files: [], children: new Map() };

  for (const file of files) {
    const raw = file.parent_path || "/";
    if (raw === "/" || raw === "") {
      root.files.push(file);
      continue;
    }

    const segments = raw.replace(/^\/|\/$/g, "").split("/").filter(Boolean);
    let current = root;
    let pathSoFar = "";

    for (const seg of segments) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${seg}` : seg;
      if (!current.children.has(seg)) {
        current.children.set(seg, {
          name: seg,
          fullPath: pathSoFar,
          files: [],
          children: new Map(),
        });
      }
      current = current.children.get(seg)!;
    }
    current.files.push(file);
  }

  return root;
}

function collectAllPaths(node: TreeNode): string[] {
  const paths: string[] = [];
  for (const child of node.children.values()) {
    paths.push(child.fullPath);
    paths.push(...collectAllPaths(child));
  }
  return paths;
}

const OUTPUT_PATTERN = /\b(reports|evidence|drafts|results|context|data)\b/;

function isOutputPath(fullPath: string): boolean {
  return OUTPUT_PATTERN.test(fullPath.toLowerCase());
}

/* ── Chevron SVG ───────────────────────────────────────────── */

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

/* ── Folder node (recursive) ──────────────────────────────── */

function FolderNode({
  node,
  depth,
  expanded,
  onToggle,
  selectedFileId,
  onSelectFile,
  onDeleteFile,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  selectedFileId: number | null;
  onSelectFile: (file: WorkspaceFile) => void;
  onDeleteFile: (fileId: number) => void;
}) {
  const isOpen = expanded.has(node.fullPath);
  const isOutput = isOutputPath(node.fullPath);
  const indent = depth * 16;

  // Sort children: output folders first, then alphabetical
  const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
    const aOut = isOutputPath(a.fullPath);
    const bOut = isOutputPath(b.fullPath);
    if (aOut && !bOut) return -1;
    if (!aOut && bOut) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      {/* Folder header */}
      <button
        onClick={() => onToggle(node.fullPath)}
        className="flex w-full items-center gap-1.5 py-1 text-left transition-colors hover:bg-gray-800/30"
        style={{ paddingLeft: `${indent + 8}px` }}
      >
        <Chevron expanded={isOpen} />
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider ${
            isOutput ? "text-emerald-500" : "text-gray-500"
          }`}
        >
          {node.name}
        </span>
        {isOutput && (
          <span className="rounded bg-emerald-900/40 px-1 py-px text-[8px] font-bold text-emerald-400">
            Output
          </span>
        )}
      </button>

      {/* Expanded content */}
      {isOpen && (
        <>
          {/* Child folders */}
          {sortedChildren.map((child) => (
            <FolderNode
              key={child.fullPath}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              selectedFileId={selectedFileId}
              onSelectFile={onSelectFile}
              onDeleteFile={onDeleteFile}
            />
          ))}

          {/* Files in this folder */}
          {node.files.map((file) => (
            <FileRow
              key={file.file_id}
              file={file}
              indent={indent + 16}
              isOutput={isOutput}
              selected={selectedFileId === file.file_id}
              onSelect={onSelectFile}
              onDelete={onDeleteFile}
            />
          ))}
        </>
      )}
    </div>
  );
}

/* ── Single file row ──────────────────────────────────────── */

function FileRow({
  file,
  indent,
  isOutput,
  selected,
  onSelect,
  onDelete,
}: {
  file: WorkspaceFile;
  indent: number;
  isOutput: boolean;
  selected: boolean;
  onSelect: (file: WorkspaceFile) => void;
  onDelete: (fileId: number) => void;
}) {
  return (
    <div
      className={`group relative ${isOutput ? "border-l-2 border-emerald-700/50" : ""}`}
    >
      <button
        onClick={() => onSelect(file)}
        className={`flex w-full items-center gap-2 py-1.5 text-left text-xs transition-colors ${
          selected
            ? "bg-gray-800/60 text-gray-200"
            : "text-gray-400 hover:bg-gray-800/30 hover:text-gray-300"
        }`}
        style={{ paddingLeft: `${indent + 8}px`, paddingRight: "12px" }}
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

/* ── Main component ───────────────────────────────────────── */

export default function FileTree({
  files,
  selectedFileId,
  onSelectFile,
  onCreateFile,
  onUploadFile,
  onDeleteFile,
}: FileTreeProps) {
  const [showNewInput, setShowNewInput] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  const tree = useMemo(() => buildTree(files), [files]);

  // Default all folders expanded
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    return new Set(collectAllPaths(tree));
  });

  // Keep newly-appeared folders expanded
  useMemo(() => {
    const allPaths = collectAllPaths(tree);
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const p of allPaths) {
        if (!next.has(p)) {
          next.add(p);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tree]);

  const toggleFolder = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleCreate = () => {
    const name = newFileName.trim();
    if (!name) return;
    onCreateFile(name);
    setNewFileName("");
    setShowNewInput(false);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onUploadFile(file.name, reader.result as string);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Sort top-level folders: output first, then alphabetical
  const sortedTopFolders = Array.from(tree.children.values()).sort((a, b) => {
    const aOut = isOutputPath(a.fullPath);
    const bOut = isOutputPath(b.fullPath);
    if (aOut && !bOut) return -1;
    if (!aOut && bOut) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-800 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Files
        </p>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {/* Folder tree */}
        {sortedTopFolders.map((node) => (
          <FolderNode
            key={node.fullPath}
            node={node}
            depth={0}
            expanded={expanded}
            onToggle={toggleFolder}
            selectedFileId={selectedFileId}
            onSelectFile={onSelectFile}
            onDeleteFile={onDeleteFile}
          />
        ))}

        {/* Root-level files (no folder) */}
        {tree.files.map((file) => (
          <FileRow
            key={file.file_id}
            file={file}
            indent={0}
            isOutput={false}
            selected={selectedFileId === file.file_id}
            onSelect={onSelectFile}
            onDelete={onDeleteFile}
          />
        ))}

        {files.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-gray-600">
            No files yet
          </p>
        )}
      </div>

      {/* New file input */}
      {showNewInput && (
        <div className="border-t border-gray-800 px-2 py-2">
          <input
            autoFocus
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setShowNewInput(false);
            }}
            placeholder="filename.md"
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:border-gray-500 focus:outline-none"
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex border-t border-gray-800">
        <button
          onClick={() => setShowNewInput(true)}
          className="flex-1 py-2 text-[10px] font-medium text-gray-500 transition-colors hover:bg-gray-800/40 hover:text-gray-300"
        >
          + New
        </button>
        <button
          onClick={() => uploadRef.current?.click()}
          className="flex-1 border-l border-gray-800 py-2 text-[10px] font-medium text-gray-500 transition-colors hover:bg-gray-800/40 hover:text-gray-300"
        >
          Upload
        </button>
        <input
          ref={uploadRef}
          type="file"
          className="hidden"
          accept=".md,.csv,.py,.sql,.json,.txt"
          onChange={handleUpload}
        />
      </div>
    </div>
  );
}
