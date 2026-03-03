"use client";

import { useState } from "react";

interface WorkspaceOnboardingProps {
  workspaceId: string;
  onComplete: () => void;
}

type Template = "agt" | "blank" | "import";

const TEMPLATES: { key: Template; label: string; description: string }[] = [
  {
    key: "agt",
    label: "AGT Pack Template",
    description: "Scaffolds prompt.md, analysis/working.md, SQL directories, and config files",
  },
  {
    key: "blank",
    label: "Blank Workspace",
    description: "Empty workspace with standard folder structure",
  },
  {
    key: "import",
    label: "Import from Pack",
    description: "Clone files from an existing analysis pack",
  },
];

const AGT_FILES = [
  { fileName: "prompt.md", content: "# Analysis Prompt\n\nDescribe your analysis objective here.\n", parentPath: "skills" },
  { fileName: "working.md", content: "# Working Notes\n\nUse this file for intermediate analysis notes.\n", parentPath: "skills" },
  { fileName: "map.json", content: '{\n  "pack_slug": "",\n  "description": "",\n  "inputs": []\n}\n', parentPath: "skills/config" },
  { fileName: "example.sql", content: "-- Add your SQL queries here\nSELECT 1;\n", parentPath: "datasets" },
];

const BLANK_FILES = [
  { fileName: "readme.md", content: "# Workspace\n\nAdd your files to get started.\n", parentPath: "skills" },
];

export default function WorkspaceOnboarding({ workspaceId, onComplete }: WorkspaceOnboardingProps) {
  const [selected, setSelected] = useState<Template>("agt");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const filesToCreate = selected === "agt" ? AGT_FILES : BLANK_FILES;

      for (const file of filesToCreate) {
        await fetch(`/api/workspaces/${workspaceId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(file),
        });
      }

      onComplete();
    } catch (err) {
      console.error("Failed to scaffold workspace:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-md rounded-lg border border-gray-700 bg-[#12141d] p-6">
        <h2 className="text-sm font-semibold text-gray-200">Set Up Your Workspace</h2>
        <p className="mt-1 text-xs text-gray-500">
          Choose a template to scaffold your workspace with the right files and structure.
        </p>

        <div className="mt-4 space-y-2">
          {TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.key}
              onClick={() => setSelected(tmpl.key)}
              disabled={tmpl.key === "import"} // Import not yet implemented
              className={`flex w-full flex-col rounded-lg border p-3 text-left transition-colors ${
                selected === tmpl.key
                  ? "border-cyan-600 bg-cyan-900/20"
                  : "border-gray-700 bg-gray-800/30 hover:border-gray-600"
              } ${tmpl.key === "import" ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span className="text-xs font-medium text-gray-200">{tmpl.label}</span>
              <span className="mt-0.5 text-[10px] text-gray-500">{tmpl.description}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded bg-cyan-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-cyan-600 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Workspace"}
          </button>
          <button
            onClick={onComplete}
            className="rounded px-4 py-1.5 text-xs text-gray-500 hover:text-gray-400"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
