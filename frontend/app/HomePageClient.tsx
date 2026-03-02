"use client";

import { useState, useEffect } from "react";
import Sidebar, { type ActiveSection } from "@/components/Sidebar";
import GenscapeNomsTable from "@/components/gas/GenscapeNomsTable";
import KrsWatchlistTable from "@/components/gas/KrsWatchlistTable";
import { WORKBENCH_V2_ENABLED } from "@/lib/feature-flags";

const SECTION_META: Record<ActiveSection, { title: string; subtitle: string; footer: string }> = {
  workbench: {
    title: "Analysis Workbench",
    subtitle: "Unified analysis environment with step pipelines, SQL execution, and AI-assisted reporting.",
    footer: "Workbench | Analysis Packs",
  },
  "genscape-noms": {
    title: "Genscape Nominations",
    subtitle: "Historical nominations data from Genscape across all pipelines.",
    footer: "Genscape Noms | Source: Azure SQL",
  },
  "krs-watchlist": {
    title: "KRS Watchlist",
    subtitle: "Tracked nominations for key location role IDs across monitored pipelines.",
    footer: "KRS Watchlist | Source: Azure SQL",
  },
};

interface WorkspaceOption {
  workspace_id: number;
  slug: string;
  display_name: string;
  agent_id: string | null;
}

function WorkbenchLauncher() {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((data) =>
        setWorkspaces((data.workspaces ?? []).filter((ws: WorkspaceOption) => !ws.agent_id))
      )
      .catch((err) => console.error("Failed to fetch workspaces:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleCreateWorkspace = async () => {
    const name = newWsName.trim();
    if (!name || creating) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    setCreating(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, displayName: name, workspaceType: "project" }),
      });
      const data = await res.json();
      // Navigate to the new workspace
      window.location.href = `/workbench/${data.workspace_id}`;
    } catch (err) {
      console.error("Failed to create workspace:", err);
      setCreating(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Loading workspaces...</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">Select a workspace to open in the workbench:</p>
        {!showNewWs ? (
          <button
            onClick={() => setShowNewWs(true)}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-700 bg-gray-900/30 px-3 py-1.5 text-gray-500 transition-colors hover:border-gray-500 hover:bg-gray-800/40 hover:text-gray-300"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-xs font-medium">New Workspace</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateWorkspace();
                if (e.key === "Escape") {
                  setShowNewWs(false);
                  setNewWsName("");
                }
              }}
              placeholder="Workspace name"
              className="rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-gray-500 focus:outline-none"
            />
            <button
              onClick={handleCreateWorkspace}
              disabled={!newWsName.trim() || creating}
              className="rounded bg-cyan-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-600 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              onClick={() => {
                setShowNewWs(false);
                setNewWsName("");
              }}
              className="rounded px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {workspaces.map((ws) => (
          <a
            key={ws.workspace_id}
            href={`/workbench/${ws.workspace_id}`}
            className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 transition-colors hover:border-gray-600 hover:bg-gray-800/60"
          >
            <p className="text-sm font-medium text-gray-200">{ws.display_name}</p>
            <p className="mt-1 text-[10px] text-gray-500">{ws.slug}</p>
          </a>
        ))}
      </div>
      {workspaces.length === 0 && (
        <p className="text-sm text-gray-600">
          No workspaces found. Click &quot;New Workspace&quot; to create one.
        </p>
      )}
    </div>
  );
}

export default function HomePageClient() {
  const [activeSection, setActiveSection] = useState<ActiveSection>("workbench");
  const meta = SECTION_META[activeSection];

  return (
    <div className="flex min-h-screen">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />

      <div className="flex-1 overflow-auto">
        <main className="px-4 py-8 sm:px-8">
          <div className="mb-8">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Helios CTA | Gas Markets
            </p>
            <h1 className="text-2xl font-bold text-gray-100 sm:text-3xl">{meta.title}</h1>
            <p className="mt-2 text-sm text-gray-500">{meta.subtitle}</p>
          </div>
          {activeSection === "genscape-noms" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 shadow-2xl">
              <GenscapeNomsTable />
            </div>
          )}
          {activeSection === "krs-watchlist" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 shadow-2xl">
              <KrsWatchlistTable />
            </div>
          )}
          {activeSection === "workbench" && WORKBENCH_V2_ENABLED && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 shadow-2xl">
              <WorkbenchLauncher />
            </div>
          )}
          <p className="mt-6 text-center text-xs text-gray-600">{meta.footer}</p>
        </main>
      </div>
    </div>
  );
}
