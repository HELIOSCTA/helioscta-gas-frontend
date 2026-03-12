"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Sidebar, { type ActiveSection } from "@/components/Sidebar";
import GenscapeNomsTable from "@/components/gas/GenscapeNomsTable";
import KrsWatchlistTable from "@/components/gas/KrsWatchlistTable";
import WatchlistEditor from "@/components/gas/WatchlistEditor";
import NomsMovements from "@/components/gas/NomsMovements";
import type { Watchlist } from "@/lib/watchlists";
import { GENSCAPE_ENABLED, ICE_CASH_ENABLED } from "@/lib/feature-flags";

const CashPricingMatrix = dynamic(() => import("@/components/gas/CashPricingMatrix"), {
  loading: () => <p className="text-sm text-gray-500">Loading cash pricing matrix...</p>,
  ssr: false,
});

const SECTION_META: Record<ActiveSection, { title: string; subtitle: string; footer: string }> = {
  home: {
    title: "Dashboard",
    subtitle: "Genscape nominations and ICE cash prices for US natural gas markets.",
    footer: "Helios CTA | Genscape + ICE Cash Prices",
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
  "watchlist-editor": {
    title: "Manage Watchlists",
    subtitle: "Create, edit, and delete watchlists for tracking Genscape nominations.",
    footer: "Watchlists | Source: Azure PostgreSQL",
  },
  "noms-movements": {
    title: "Nom Movements",
    subtitle: "Pipelines where the latest nomination volume moved materially vs trailing 7-day and 30-day averages.",
    footer: "Nom Movements | Source: Azure SQL",
  },
  "cash-pricing-matrix": {
    title: "Cash Pricing Matrix",
    subtitle: "Current-month and seasonal NYMEX cash-vs-Henry-Hub futures matrix across key US gas hubs.",
    footer: "ICE Cash Prices | Source: ICE / Azure PostgreSQL",
  },
};

type FeatureSection = Exclude<ActiveSection, "home">;

interface HomeCard {
  id: FeatureSection;
  title: string;
  description: string;
  source: string;
  iconPath: string;
  accentColor: string;
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
    id: "noms-movements",
    title: "Nom Movements",
    description: "Pipelines with material nomination changes vs trailing 7-day and 30-day averages.",
    source: "Azure SQL",
    iconPath: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
    accentColor: "purple",
  },
  {
    id: "cash-pricing-matrix",
    title: "Cash Pricing Matrix",
    description: "NYMEX-style current-month and seasonal cash matrix relative to Henry Hub futures.",
    source: "ICE / Azure PostgreSQL",
    iconPath: "M3.375 19.5h17.25m-17.25 0A1.125 1.125 0 012.25 18.375V5.625A1.125 1.125 0 013.375 4.5h17.25A1.125 1.125 0 0121.75 5.625v12.75A1.125 1.125 0 0120.625 19.5m-17.25 0h17.25M6 9h.008v.008H6V9zm0 3h.008v.008H6V12zm0 3h.008v.008H6V15zm3-6h.008v.008H9V9zm0 3h.008v.008H9V12zm0 3h.008v.008H9V15zm3-6h.008v.008H12V9zm0 3h.008v.008H12V12zm0 3h.008v.008H12V15zm3-6h.008v.008H15V9zm0 3h.008v.008H15V12zm0 3h.008v.008H15V15zm3-6h.008v.008H18V9zm0 3h.008v.008H18V12zm0 3h.008v.008H18V15z",
    accentColor: "cyan",
  },
];

const ACCENT_CLASSES: Record<
  string,
  { bg: string; icon: string; border: string; shadow: string }
> = {
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
};

function isFeatureEnabled(section: FeatureSection): boolean {
  if (
    section === "genscape-noms" ||
    section === "noms-movements" ||
    section === "watchlists" ||
    section === "watchlist-editor"
  ) {
    return GENSCAPE_ENABLED;
  }

  return ICE_CASH_ENABLED;
}

function HomeCards({
  cards,
  onNavigate,
}: {
  cards: HomeCard[];
  onNavigate: (section: ActiveSection) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const accent = ACCENT_CLASSES[card.accentColor];
        return (
          <button
            key={card.id}
            onClick={() => onNavigate(card.id)}
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

  const homeCards = useMemo(
    () => HOME_CARDS.filter((card) => isFeatureEnabled(card.id)),
    []
  );

  useEffect(() => {
    if (!GENSCAPE_ENABLED) {
      setWatchlistsLoading(false);
      return;
    }

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

  useEffect(() => {
    if (activeSection !== "home" && !isFeatureEnabled(activeSection)) {
      setActiveSection("home");
    }
  }, [activeSection]);

  const meta = SECTION_META[activeSection];

  return (
    <div className="flex min-h-screen">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        enabled={{ genscape: GENSCAPE_ENABLED, iceCash: ICE_CASH_ENABLED }}
      />

      <div className="flex-1 overflow-auto">
        <main className="px-4 py-8 sm:px-8">
          <div className="mb-8">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Helios CTA | Gas Markets
            </p>
            <h1 className="text-2xl font-bold text-gray-100 sm:text-3xl">{meta.title}</h1>
            <p className="mt-2 text-sm text-gray-500">{meta.subtitle}</p>
          </div>
          {activeSection === "home" &&
            (homeCards.length > 0 ? (
              <HomeCards cards={homeCards} onNavigate={setActiveSection} />
            ) : (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 text-sm text-gray-500">
                No features are enabled.
              </div>
            ))}
          {activeSection === "genscape-noms" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 shadow-2xl">
              <GenscapeNomsTable />
            </div>
          )}
          {activeSection === "watchlists" && (
            <>
              <div className="mb-4 flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Watchlist
                </span>
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
          {activeSection === "noms-movements" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 shadow-2xl">
              <NomsMovements />
            </div>
          )}
          {activeSection === "cash-pricing-matrix" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 shadow-2xl">
              <CashPricingMatrix />
            </div>
          )}
          <p className="mt-6 text-center text-xs text-gray-600">{meta.footer}</p>
        </main>
      </div>
    </div>
  );
}
