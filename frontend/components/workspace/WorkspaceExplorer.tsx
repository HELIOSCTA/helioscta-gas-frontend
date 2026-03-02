"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import FileTree, { type WorkspaceFile } from "./FileTree";
import FileEditor from "./FileEditor";
import MarkdownPreview from "./MarkdownPreview";
import CsvPreview from "./CsvPreview";
import ImageViewer from "./ImageViewer";
import PlotGenerator from "./PlotGenerator";

interface Workspace {
  workspace_id: number;
  slug: string;
  display_name: string;
  workspace_type: string;
  agent_id: string | null;
}

type ViewMode = "edit" | "preview";

export default function WorkspaceExplorer() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<number | null>(null);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");

  // Track the current file id in a ref to prevent race conditions on save
  const currentFileRef = useRef<{ fileId: number; wsId: number } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch workspaces
  useEffect(() => {
    setLoading(true);
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((data) => {
        const ws: Workspace[] = data.workspaces ?? [];
        setWorkspaces(ws);
        if (ws.length > 0 && !activeWsId) {
          setActiveWsId(ws[0].workspace_id);
        }
      })
      .catch((err) => console.error("Failed to fetch workspaces:", err))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch files when workspace changes
  useEffect(() => {
    if (!activeWsId) {
      setFiles([]);
      return;
    }
    fetch(`/api/workspaces/${activeWsId}/files`)
      .then((r) => r.json())
      .then((data) => setFiles(data.files ?? []))
      .catch((err) => console.error("Failed to fetch files:", err));
  }, [activeWsId]);

  // Load file content when selected
  useEffect(() => {
    if (!selectedFile || !activeWsId) {
      setFileContent("");
      return;
    }
    const textTypes = ["md", "csv", "py", "sql", "json", "txt"];
    if (textTypes.includes(selectedFile.file_type)) {
      fetch(`/api/workspaces/${activeWsId}/files/${selectedFile.file_id}`)
        .then((r) => r.json())
        .then((data) => setFileContent(data.content ?? ""))
        .catch((err) => console.error("Failed to load file:", err));
    }
  }, [selectedFile, activeWsId]);

  // Keep currentFileRef in sync
  useEffect(() => {
    currentFileRef.current =
      selectedFile && activeWsId
        ? { fileId: selectedFile.file_id, wsId: activeWsId }
        : null;
  }, [selectedFile, activeWsId]);

  // Save file content with debounce and stale-file guard
  const handleSave = useCallback(
    (content: string) => {
      if (!selectedFile || !activeWsId) return;

      // Capture the target at call time
      const targetFileId = selectedFile.file_id;
      const targetWsId = activeWsId;

      // Clear any pending save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(async () => {
        // Guard: abort if user navigated away from this file
        if (
          currentFileRef.current?.fileId !== targetFileId ||
          currentFileRef.current?.wsId !== targetWsId
        ) {
          return;
        }
        setSaving(true);
        try {
          await fetch(`/api/workspaces/${targetWsId}/files/${targetFileId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          });
        } catch (err) {
          console.error("Failed to save:", err);
        } finally {
          setSaving(false);
        }
      }, 500);
    },
    [selectedFile, activeWsId]
  );

  // Create new file
  const handleCreateFile = useCallback(
    async (fileName: string) => {
      if (!activeWsId) return;
      try {
        const res = await fetch(`/api/workspaces/${activeWsId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName, content: "" }),
        });
        const data = await res.json();
        // Refresh file list
        const listRes = await fetch(`/api/workspaces/${activeWsId}/files`);
        const listData = await listRes.json();
        setFiles(listData.files ?? []);
        // Select the new file
        const newFile = (listData.files as WorkspaceFile[]).find(
          (f) => f.file_id === data.file_id
        );
        if (newFile) setSelectedFile(newFile);
      } catch (err) {
        console.error("Failed to create file:", err);
      }
    },
    [activeWsId]
  );

  // Upload file
  const handleUploadFile = useCallback(
    async (fileName: string, content: string) => {
      if (!activeWsId) return;
      try {
        await fetch(`/api/workspaces/${activeWsId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName, content }),
        });
        // Refresh file list
        const listRes = await fetch(`/api/workspaces/${activeWsId}/files`);
        const listData = await listRes.json();
        setFiles(listData.files ?? []);
      } catch (err) {
        console.error("Failed to upload file:", err);
      }
    },
    [activeWsId]
  );

  // Delete file
  const handleDeleteFile = useCallback(
    async (fileId: number) => {
      if (!activeWsId) return;
      try {
        await fetch(`/api/workspaces/${activeWsId}/files/${fileId}`, {
          method: "DELETE",
        });
        setFiles((prev) => prev.filter((f) => f.file_id !== fileId));
        if (selectedFile?.file_id === fileId) {
          setSelectedFile(null);
          setFileContent("");
        }
      } catch (err) {
        console.error("Failed to delete file:", err);
      }
    },
    [activeWsId, selectedFile]
  );

  // Create workspace
  const handleCreateWorkspace = async () => {
    const name = newWsName.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, displayName: name, workspaceType: "project" }),
      });
      const data = await res.json();
      const newWs: Workspace = {
        workspace_id: data.workspace_id,
        slug,
        display_name: name,
        workspace_type: "project",
        agent_id: null,
      };
      setWorkspaces((prev) => [newWs, ...prev]);
      setActiveWsId(data.workspace_id);
      setNewWsName("");
      setShowNewWs(false);
    } catch (err) {
      console.error("Failed to create workspace:", err);
    }
  };

  // Render file content area
  const renderContent = () => {
    if (!selectedFile) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-gray-600">
            Select a file or create a new one
          </p>
        </div>
      );
    }

    const imageTypes = ["png", "svg"];
    if (imageTypes.includes(selectedFile.file_type)) {
      return (
        <ImageViewer
          src={`/api/workspaces/${activeWsId}/files/${selectedFile.file_id}`}
          fileName={selectedFile.file_name}
        />
      );
    }

    if (selectedFile.file_type === "csv" && viewMode === "preview") {
      return <CsvPreview content={fileContent} />;
    }

    if (selectedFile.file_type === "md" && viewMode === "preview") {
      return <MarkdownPreview content={fileContent} />;
    }

    return (
      <FileEditor
        content={fileContent}
        fileType={selectedFile.file_type}
        onChange={(newContent) => {
          setFileContent(newContent);
          handleSave(newContent);
        }}
      />
    );
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-gray-500">Loading workspaces...</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] rounded-xl border border-gray-800 bg-[#0b0d14] overflow-hidden">
      {/* File tree panel */}
      <div className="w-60 flex-shrink-0 border-r border-gray-800 flex flex-col">
        {/* Workspace selector */}
        <div className="border-b border-gray-800 px-3 py-2">
          <select
            value={activeWsId ?? ""}
            onChange={(e) => {
              setActiveWsId(Number(e.target.value));
              setSelectedFile(null);
              setFileContent("");
            }}
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:border-gray-500 focus:outline-none"
          >
            {workspaces.map((ws) => (
              <option key={ws.workspace_id} value={ws.workspace_id}>
                {ws.display_name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowNewWs(true)}
            className="mt-1 w-full rounded py-1 text-[10px] text-gray-500 transition-colors hover:bg-gray-800/40 hover:text-gray-300"
          >
            + New Workspace
          </button>
          {showNewWs && (
            <div className="mt-1 flex gap-1">
              <input
                autoFocus
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateWorkspace();
                  if (e.key === "Escape") setShowNewWs(false);
                }}
                placeholder="Workspace name"
                className="flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:border-gray-500 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-hidden">
          <FileTree
            files={files}
            selectedFileId={selectedFile?.file_id ?? null}
            onSelectFile={setSelectedFile}
            onCreateFile={handleCreateFile}
            onUploadFile={handleUploadFile}
            onDeleteFile={handleDeleteFile}
          />
        </div>
      </div>

      {/* Editor / preview panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        {selectedFile && (
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-300">
                {selectedFile.file_name}
              </span>
              {saving && (
                <span className="text-[10px] text-gray-600">Saving...</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {(selectedFile.file_type === "md" ||
                selectedFile.file_type === "csv") && (
                <>
                  <button
                    onClick={() => setViewMode("edit")}
                    className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                      viewMode === "edit"
                        ? "bg-gray-800 text-gray-200"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setViewMode("preview")}
                    className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                      viewMode === "preview"
                        ? "bg-gray-800 text-gray-200"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    Preview
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-auto">
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-hidden">{renderContent()}</div>
            {selectedFile?.file_type === "csv" && fileContent && (
              <PlotGenerator
                csvContent={fileContent}
                blobPath={selectedFile.blob_path}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
