"use client";

import { useState } from "react";
import { WORKBENCH_V2_ENABLED } from "@/lib/feature-flags";

export type ActiveSection = "home" | "workbench" | "genscape-noms" | "watchlists" | "watchlist-editor" | "cash-balmo" | "wx-cash-balmo";

interface SidebarProps {
  activeSection: ActiveSection;
  onSectionChange: (section: ActiveSection) => void;
}

interface NavItem {
  id: ActiveSection;
  label: string;
  iconPath: string;
  iconColor: string;
  group?: string;
}

interface TopSection {
  key: string;
  label: string;
  railLabel: string;
  railIconPath: string;
  railIconColor: string;
  navItems: NavItem[];
}

const TOP_SECTIONS: TopSection[] = [
  {
    key: "genscape",
    label: "GENSCAPE",
    railLabel: "Genscape",
    railIconPath:
      "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
    railIconColor: "text-purple-400",
    navItems: [
      {
        id: "watchlists",
        label: "Watchlists",
        group: "Watchlists",
        iconPath:
          "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
        iconColor: "text-purple-400",
      },
      {
        id: "watchlist-editor",
        label: "Manage Watchlists",
        group: "Watchlists",
        iconPath:
          "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
        iconColor: "text-purple-400",
      },
      {
        id: "genscape-noms",
        label: "Daily Noms",
        group: "Noms",
        iconPath:
          "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
        iconColor: "text-purple-400",
      },
    ],
  },
  {
    key: "ice",
    label: "ICE CASH PRICES",
    railLabel: "ICE",
    railIconPath:
      "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    railIconColor: "text-cyan-400",
    navItems: [
      {
        id: "cash-balmo",
        label: "Cash-Balmo",
        iconPath:
          "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
        iconColor: "text-cyan-400",
      },
      {
        id: "wx-cash-balmo",
        label: "Wx Adj Cash-Balmo",
        iconPath:
          "M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z",
        iconColor: "text-cyan-400",
      },
    ],
  },
  {
    key: "agents",
    label: "AGENTS",
    railLabel: "Agents",
    railIconPath:
      "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-1.46 1.46a2.25 2.25 0 01-1.591.659H8.051a2.25 2.25 0 01-1.591-.659L5 14.5m14 0V5a2 2 0 00-2-2H7a2 2 0 00-2 2v9.5",
    railIconColor: "text-amber-400",
    navItems: [
      {
        id: "workbench",
        label: "Workbench",
        iconPath:
          "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6",
        iconColor: "text-amber-400",
      },
    ],
  },
];

// Map each ActiveSection to its parent TopSection key
function getParentKey(section: ActiveSection): string {
  for (const top of TOP_SECTIONS) {
    if (top.navItems.some((item) => item.id === section)) return top.key;
  }
  return TOP_SECTIONS[0].key;
}

export default function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  const [activeTopSection, setActiveTopSection] = useState<string>(getParentKey(activeSection));
  const [panelOpen, setPanelOpen] = useState(true);

  // Filter nav items based on feature flags
  const filteredSections = TOP_SECTIONS.map((section) => ({
    ...section,
    navItems: section.navItems.filter((item) => {
      if (item.id === "workbench" && !WORKBENCH_V2_ENABLED) return false;
      return true;
    }),
  })).filter((section) => section.navItems.length > 0);

  const currentTopSection = filteredSections.find((s) => s.key === activeTopSection) ?? filteredSections[0];

  const handleRailClick = (key: string) => {
    if (activeTopSection === key) {
      setPanelOpen((v) => !v);
    } else {
      setActiveTopSection(key);
      setPanelOpen(true);
    }
  };

  return (
    <div className="flex">
      {/* Icon Rail */}
      <aside className="flex w-[56px] flex-col items-center border-r border-gray-800 bg-[#080a10] py-3 gap-1">
        {/* Home button */}
        <button
          onClick={() => {
            onSectionChange("home");
            setPanelOpen(false);
          }}
          className={`group flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 transition-colors ${
            activeSection === "home"
              ? "bg-gray-800/70 text-white"
              : "text-gray-500 hover:bg-gray-800/40 hover:text-gray-300"
          }`}
          title="Home"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-5 w-5 ${activeSection === "home" ? "text-blue-400" : "text-gray-500 group-hover:text-gray-400"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
          <span className="text-[9px] font-medium leading-tight">Home</span>
        </button>

        <div className="mx-2 my-1 h-px w-6 bg-gray-800" />

        {filteredSections.map((section) => {
          const isActive = activeTopSection === section.key;
          return (
            <button
              key={section.key}
              onClick={() => handleRailClick(section.key)}
              className={`group flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 transition-colors ${
                isActive
                  ? "bg-gray-800/70 text-white"
                  : "text-gray-500 hover:bg-gray-800/40 hover:text-gray-300"
              }`}
              title={section.railLabel}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-5 w-5 ${isActive ? section.railIconColor : "text-gray-500 group-hover:text-gray-400"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={section.railIconPath} />
              </svg>
              <span className="text-[9px] font-medium leading-tight">{section.railLabel}</span>
            </button>
          );
        })}
      </aside>

      {/* Expanded Panel */}
      {panelOpen && currentTopSection && (
        <aside className="flex w-48 flex-col border-r border-gray-800 bg-[#0b0d14]">
          {/* Panel Header */}
          <div className="flex items-center justify-between px-3 py-4">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
              {currentTopSection.label}
            </span>
            <button
              onClick={() => setPanelOpen(false)}
              className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
              title="Collapse panel"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>

          {/* Nav Items */}
          <nav className="flex-1 px-2 py-1 space-y-1">
            {currentTopSection.navItems.map((item, i) => {
              const isActive = activeSection === item.id;
              const prevGroup = i > 0 ? currentTopSection.navItems[i - 1].group : undefined;
              const showGroupHeader = item.group && item.group !== prevGroup;
              return (
                <div key={item.id}>
                  {showGroupHeader && (
                    <p className={`px-3 text-[10px] font-bold uppercase tracking-wider text-gray-600 ${i > 0 ? "mt-3 pt-3 border-t border-gray-800/60" : ""} mb-1`}>
                      {item.group}
                    </p>
                  )}
                  <button
                    onClick={() => onSectionChange(item.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-gray-800/60 text-white"
                        : "text-gray-400 hover:bg-gray-800/40 hover:text-gray-200"
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 flex-shrink-0 ${item.iconColor}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.iconPath} />
                    </svg>
                    <span>{item.label}</span>
                  </button>
                </div>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-gray-800 px-3 py-3">
            <p className="text-[10px] text-gray-600">Source: Azure SQL</p>
          </div>
        </aside>
      )}
    </div>
  );
}
