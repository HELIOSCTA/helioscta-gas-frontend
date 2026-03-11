"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Sidebar, { type ActiveSection } from "@/components/Sidebar";
import GenscapeNomsTable from "@/components/gas/GenscapeNomsTable";
import KrsWatchlistTable from "@/components/gas/KrsWatchlistTable";
import WatchlistEditor from "@/components/gas/WatchlistEditor";
import type { Watchlist } from "@/lib/watchlists";
import { WORKBENCH_V2_ENABLED, DAILY_REPORTS_ENABLED } from "@/lib/feature-flags";

const CashBalmoTable = dynamic(() => import("@/components/gas/CashBalmoTable"), {
  loading: () => <p className="text-sm text-gray-500">Loading cash-balmo view...</p>,
  ssr: false,
});

const WxCashBalmoTable = dynamic(() => import("@/components/gas/WxCashBalmoTable"), {
  loading: () => <p className="text-sm text-gray-500">Loading weather-adjusted view...</p>,
  ssr: false,
});

const CashPricingMatrix = dynamic(() => import("@/components/gas/CashPricingMatrix"), {
  loading: () => <p className="text-sm text-gray-500">Loading cash pricing matrix...</p>,
  ssr: false,
});

const CashAndNomsTable = dynamic(() => import("@/components/gas/CashAndNomsTable"), {
  loading: () => <p className="text-sm text-gray-500">Loading cash and noms...</p>,
  ssr: false,
});

const SECTION_META: Record<ActiveSection, { title: string; subtitle: string; footer: string }> = {
  home: {
    title: "Dashboard",
    subtitle: "Overview of all gas market data feeds and analysis tools.",
    footer: "Helios CTA | Gas Markets",
  },
  workbench: {
    title: "Analysis Workbench",
    subtitle: "Unified analysis environment with step pipelines, SQL execution, and AI-assisted reporting.",
    footer: "Workbench | Analysis Packs",
  },
  "genscape-noms": {
    title: "Historical Noms",
    subtitle: "Historical nominations data from Genscape across all pipelines.",
    footer: "Historical Noms | Source: Azure SQL",
  },
  watchlists: {
    title: "Watchlists",
    subtitle: "Tracked nominations for key location role IDs across monitored pipelines.",
    footer: "Watchlists | Source: Azure SQL",
  },
  "cash-balmo": {
    title: "ICE Cash-Balmo",
    subtitle: "Next-day gas cash prices vs balance-of-month (Balmo) across key US natural gas hubs.",
    footer: "ICE Cash Prices | Source: ICE / Azure PostgreSQL",
  },
  "wx-cash-balmo": {
    title: "Wx Adj Cash-Balmo",
    subtitle: "Weather-adjusted cash vs Balmo spreads with regional degree-day departures from normal.",
    footer: "ICE Cash Prices | Source: ICE + WSI WDD / Azure PostgreSQL",
  },
  "watchlist-editor": {
    title: "Manage Watchlists",
    subtitle: "Create, edit, and delete watchlists for tracking Genscape nominations.",
    footer: "Watchlists | Source: Azure PostgreSQL",
  },
  "cash-and-noms": {
    title: "Noms v Cash",
    subtitle: "ICE cash prices alongside Genscape nominations for watchlist locations.",
    footer: "Noms v Cash | Source: ICE + Azure SQL",
  },
  "cash-pricing-matrix": {
    title: "Cash Pricing Matrix",
    subtitle: "ICE cash pricing matrix across US natural gas hubs.",
    footer: "ICE Cash Prices | Source: ICE / Azure PostgreSQL",
  },
  "daily-reports": {
    title: "Daily Reports",
    subtitle: "AI-generated daily gas market reports with structured analysis and trade signals.",
    footer: "Reports | AI Agent",
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

interface HomeCard {
  id: ActiveSection;
  title: string;
  description: string;
  source: string;
  iconPath: string;
  accentColor: string; // tailwind color token, e.g. "purple"
}

const HOME_CARDS: HomeCard[] = [
  {
    id: "watchlists",
    title: "Watchlists",
    description: "Tracked nominations for key location role IDs across monitored pipelines.",
    source: "Azure SQL",
    iconPath: "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
    accentColor: "purple",
  },
  {
    id: "genscape-noms",
    title: "Daily Noms",
    description: "Historical nominations data from Genscape across all pipelines.",
    source: "Azure SQL",
    iconPath: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    accentColor: "purple",
  },
  {
    id: "cash-balmo",
    title: "ICE Cash-Balmo",
    description: "Next-day gas cash prices vs balance-of-month (Balmo) across key US natural gas hubs.",
    source: "ICE / Azure PostgreSQL",
    iconPath: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    accentColor: "cyan",
  },
  {
    id: "cash-pricing-matrix",
    title: "Cash Pricing Matrix",
    description: "Daily cash prices for US natural gas hubs relative to NYMEX HH prompt-month futures.",
    source: "ICE / Azure PostgreSQL",
    iconPath: "M3.375 19.5h17.25m-17.25 0A1.125 1.125 0 012.25 18.375V5.625A1.125 1.125 0 013.375 4.5h17.25A1.125 1.125 0 0121.75 5.625v12.75A1.125 1.125 0 0120.625 19.5m-17.25 0h17.25M6 9h.008v.008H6V9zm0 3h.008v.008H6V12zm0 3h.008v.008H6V15zm3-6h.008v.008H9V9zm0 3h.008v.008H9V12zm0 3h.008v.008H9V15zm3-6h.008v.008H12V9zm0 3h.008v.008H12V12zm0 3h.008v.008H12V15zm3-6h.008v.008H15V9zm0 3h.008v.008H15V12zm0 3h.008v.008H15V15zm3-6h.008v.008H18V9zm0 3h.008v.008H18V12zm0 3h.008v.008H18V15z",
    accentColor: "cyan",
  },
  {
    id: "wx-cash-balmo",
    title: "Wx Adj Cash-Balmo",
    description: "Weather-adjusted cash vs Balmo spreads with regional degree-day departures from normal.",
    source: "ICE + WSI WDD / Azure PostgreSQL",
    iconPath: "M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z",
    accentColor: "cyan",
  },
  {
    id: "workbench",
    title: "Analysis Workbench",
    description: "Unified analysis environment with step pipelines, SQL execution, and AI-assisted reporting.",
    source: "Azure PostgreSQL",
    iconPath: "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6",
    accentColor: "amber",
  },
  {
    id: "daily-reports",
    title: "Daily Reports",
    description: "AI-generated daily gas market reports with structured analysis and trade signals.",
    source: "AI Agent + PostgreSQL",
    iconPath: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z",
    accentColor: "amber",
  },
];

const ACCENT_CLASSES: Record<string, { bg: string; icon: string; border: string; shadow: string }> = {
  purple: {
    bg: "bg-purple-500/10",
    icon: "text-purple-400",
    border: "hover:border-purple-500/40",
    shadow: "hover:shadow-purple-500/5",
  },
  cyan: {
    bg: "bg-cyan-500/10",
    icon: "text-cyan-400",
    border: "hover:border-cyan-500/40",
    shadow: "hover:shadow-cyan-500/5",
  },
  amber: {
    bg: "bg-amber-500/10",
    icon: "text-amber-400",
    border: "hover:border-amber-500/40",
    shadow: "hover:shadow-amber-500/5",
  },
};

function HomeCards({ onNavigate }: { onNavigate: (section: ActiveSection) => void }) {
  const cards = HOME_CARDS.filter((c) => {
    if (c.id === "workbench" && !WORKBENCH_V2_ENABLED) return false;
    if (c.id === "daily-reports" && !DAILY_REPORTS_ENABLED) return false;
    return true;
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const accent = ACCENT_CLASSES[card.accentColor];
        return (
          <button
            key={card.id}
            onClick={() => {
              if (card.id === "daily-reports") {
                window.location.href = "/reports";
              } else {
                onNavigate(card.id);
              }
            }}
            className={`group flex flex-col rounded-xl border border-gray-800 bg-gray-900/60 p-5 text-left transition-all hover:shadow-lg ${accent.border} ${accent.shadow}`}
          >
            <div className="flex items-start justify-between">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent.bg}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${accent.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={card.iconPath} />
                </svg>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-gray-700 transition-colors group-hover:${accent.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
              </svg>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-gray-100">{card.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{card.description}</p>
            <div className="mt-auto pt-4">
              <span className="inline-block rounded-full border border-gray-800 bg-gray-800/50 px-2.5 py-0.5 text-[10px] font-medium text-gray-500">
                {card.source}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function HomePageClient() {
  const [activeSection, setActiveSection] = useState<ActiveSection>("home");
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeWatchlist, setActiveWatchlist] = useState<Watchlist | null>(null);
  const [watchlistsLoading, setWatchlistsLoading] = useState(true);
  const meta = SECTION_META[activeSection];

  useEffect(() => {
    fetch("/api/watchlists")
      .then((r) => r.json())
      .then((data) => {
        const wls: Watchlist[] = (data.watchlists ?? []).map(
          (row: { slug: string; display_name: string; location_role_ids: number[] }) => ({
            id: row.slug,
            name: row.display_name,
            locationRoleIds: row.location_role_ids,
          })
        );
        setWatchlists(wls);
        if (wls.length > 0) setActiveWatchlist(wls[0]);
      })
      .catch((err) => console.error("Failed to fetch watchlists:", err))
      .finally(() => setWatchlistsLoading(false));
  }, []);

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
          {activeSection === "home" && (
            <div />
          )}
          {activeSection === "genscape-noms" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 shadow-2xl">
              <GenscapeNomsTable />
            </div>
          )}
          {activeSection === "watchlists" && (
            <>
              {/* Watchlist selector */}
              <div className="mb-4 flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Watchlist</span>
                {watchlistsLoading ? (
                  <span className="text-xs text-gray-600">Loading...</span>
                ) : (
                  <div className="flex gap-1.5">
                    {watchlists.map((wl) => (
                      <button
                        key={wl.id}
                        onClick={() => setActiveWatchlist(wl)}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                          activeWatchlist?.id === wl.id
                            ? "bg-gray-700 text-white"
                            : "border border-gray-800 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                        }`}
                      >
                        {wl.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {activeWatchlist && (
                <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 shadow-2xl">
                  <KrsWatchlistTable key={activeWatchlist.id} watchlist={activeWatchlist} />
                </div>
              )}
            </>
          )}
          {activeSection === "watchlist-editor" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 shadow-2xl">
              <WatchlistEditor />
            </div>
          )}
          {activeSection === "cash-balmo" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 shadow-2xl">
              <CashBalmoTable />
            </div>
          )}
          {activeSection === "cash-pricing-matrix" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 shadow-2xl">
              <CashPricingMatrix />
            </div>
          )}
          {activeSection === "wx-cash-balmo" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 shadow-2xl">
              <WxCashBalmoTable />
            </div>
          )}
          {activeSection === "cash-and-noms" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 shadow-2xl">
              <CashAndNomsTable watchlists={watchlists} watchlistsLoading={watchlistsLoading} />
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
