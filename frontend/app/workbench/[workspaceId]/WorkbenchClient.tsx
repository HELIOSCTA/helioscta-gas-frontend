"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { type WorkspaceFile } from "@/components/workspace/FileTree";
import FileEditor from "@/components/workspace/FileEditor";
import MarkdownPreview from "@/components/workspace/MarkdownPreview";
import CsvPreview from "@/components/workspace/CsvPreview";
import ImageViewer from "@/components/workspace/ImageViewer";
import FolderExplorer from "@/components/workbench/FolderExplorer";
import WorkbenchChat from "@/components/workbench/WorkbenchChat";

type ViewMode = "edit" | "preview";

interface WorkbenchClientProps {
  workspaceId: string;
}

export default function WorkbenchClient({ workspaceId }: WorkbenchClientProps) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [saving, setSaving] = useState(false);

  const currentFileRef = useRef<{ fileId: number; wsId: string } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch files for workspace
  const refreshFiles = useCallback(() => {
    fetch(`/api/workspaces/${workspaceId}/files`)
      .then((r) => r.json())
      .then((data) => setFiles(data.files ?? []))
      .catch((err) => console.error("Failed to fetch files:", err));
  }, [workspaceId]);

  useEffect(() => {
    refreshFiles();
  }, [refreshFiles]);

  // Load file content
  useEffect(() => {
    if (!selectedFile) {
      setFileContent("");
      return;
    }
    const textTypes = ["md", "csv", "py", "sql", "json", "txt"];
    if (textTypes.includes(selectedFile.file_type)) {
      fetch(`/api/workspaces/${workspaceId}/files/${selectedFile.file_id}`)
        .then((r) => r.json())
        .then((data) => setFileContent(data.content ?? ""))
        .catch((err) => console.error("Failed to load file:", err));
    }
  }, [selectedFile, workspaceId]);

  // Keep currentFileRef in sync
  useEffect(() => {
    currentFileRef.current =
      selectedFile ? { fileId: selectedFile.file_id, wsId: workspaceId } : null;
  }, [selectedFile, workspaceId]);

  // Save file content with debounce
  const handleSaveFile = useCallback(
    (content: string) => {
      if (!selectedFile) return;
      const targetFileId = selectedFile.file_id;
      const targetWsId = workspaceId;

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(async () => {
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
    [selectedFile, workspaceId]
  );

  // Create file
  const handleCreateFile = useCallback(
    async (fileName: string, parentPath: string) => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName, content: "", parentPath }),
        });
        const data = await res.json();
        const listRes = await fetch(`/api/workspaces/${workspaceId}/files`);
        const listData = await listRes.json();
        setFiles(listData.files ?? []);
        const newFile = (listData.files as WorkspaceFile[]).find(
          (f) => f.file_id === data.file_id
        );
        if (newFile) setSelectedFile(newFile);
      } catch (err) {
        console.error("Failed to create file:", err);
      }
    },
    [workspaceId]
  );

  // Upload file
  const handleUploadFile = useCallback(
    async (fileName: string, content: string, parentPath: string) => {
      try {
        await fetch(`/api/workspaces/${workspaceId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName, content, parentPath }),
        });
        const listRes = await fetch(`/api/workspaces/${workspaceId}/files`);
        const listData = await listRes.json();
        setFiles(listData.files ?? []);
      } catch (err) {
        console.error("Failed to upload file:", err);
      }
    },
    [workspaceId]
  );

  // Delete file
  const handleDeleteFile = useCallback(
    async (fileId: number) => {
      try {
        await fetch(`/api/workspaces/${workspaceId}/files/${fileId}`, {
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
    [workspaceId, selectedFile]
  );

  // Content rendering
  const renderContent = () => {
    if (!selectedFile) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-gray-600">Select a file to view or edit</p>
        </div>
      );
    }

    const imageTypes = ["png", "svg"];
    if (imageTypes.includes(selectedFile.file_type)) {
      return (
        <ImageViewer
          src={`/api/workspaces/${workspaceId}/files/${selectedFile.file_id}`}
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
          handleSaveFile(newContent);
        }}
      />
    );
  };

  return (
    <div className="flex h-screen flex-col bg-[#0f1117] text-gray-100">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-[#0b0d14] px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => (window.location.href = "/")}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            &larr; Back
          </button>
          <span className="text-xs font-medium text-gray-300">
            Workspace {workspaceId}
          </span>
        </div>
        <button
          onClick={() => setRightPanelOpen((v) => !v)}
          className="rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-800/40 hover:text-gray-300"
        >
          {rightPanelOpen ? "Hide Chat" : "Show Chat"}
        </button>
      </div>

      {/* Main three-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT PANEL — Folder Explorer (260px) */}
        <div className="w-[260px] flex-shrink-0 border-r border-gray-800 bg-[#0b0d14]">
          <FolderExplorer
            files={files}
            selectedFileId={selectedFile?.file_id ?? null}
            onSelectFile={(file) => {
              setSelectedFile(file);
              setViewMode("edit");
            }}
            onCreateFile={handleCreateFile}
            onUploadFile={handleUploadFile}
            onDeleteFile={handleDeleteFile}
          />
        </div>

        {/* CENTER PANEL — Content Area (flex-1) */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Toolbar */}
          {selectedFile && (
            <div className="flex items-center justify-between border-b border-gray-800 bg-[#0b0d14] px-4 py-2">
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
          <div className="flex-1 overflow-auto">{renderContent()}</div>
        </div>

        {/* RIGHT PANEL — Agent Chat (350px) */}
        {rightPanelOpen && (
          <div className="w-[350px] flex-shrink-0 border-l border-gray-800 bg-[#0b0d14]">
            <WorkbenchChat
              workspaceId={workspaceId}
              selectedFileIds={selectedFile ? [selectedFile.file_id] : []}
            />
          </div>
        )}
      </div>
    </div>
  );
}
