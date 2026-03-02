"use client";

import { useState } from "react";
import { WORKBENCH_V2_ENABLED } from "@/lib/feature-flags";

export type ActiveSection = "workbench" | "genscape-noms" | "krs-watchlist";

interface SidebarProps {
  activeSection: ActiveSection;
  onSectionChange: (section: ActiveSection) => void;
}

interface NavItem {
  id: ActiveSection;
  label: string;
  iconPath: string;
  iconColor: string;
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
  {
    key: "genscape",
    label: "GENSCAPE",
    railLabel: "Genscape",
    railIconPath:
      "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
    railIconColor: "text-purple-400",
    navItems: [
      {
        id: "genscape-noms",
        label: "Genscape Noms",
        iconPath:
          "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
        iconColor: "text-purple-400",
      },
      {
        id: "krs-watchlist",
        label: "KRS Watchlist",
        iconPath:
          "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
        iconColor: "text-purple-400",
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
            {currentTopSection.navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
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
