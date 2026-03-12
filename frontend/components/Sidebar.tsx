"use client";

import { useState } from "react";

export type ActiveSection =
  | "home"
  | "genscape-noms"
  | "watchlists"
  | "watchlist-editor"
  | "cash-pricing-matrix";

interface SidebarProps {
  activeSection: ActiveSection;
  onSectionChange: (section: ActiveSection) => void;
  enabled: {
    genscape: boolean;
    iceCash: boolean;
  };
}

interface NavItem {
  id: ActiveSection;
  label: string;
  group?: string;
}

interface TopSection {
  key: string;
  label: string;
  navItems: NavItem[];
}

function getSections(enabled: SidebarProps["enabled"]): TopSection[] {
  const sections: TopSection[] = [];

  if (enabled.genscape) {
    sections.push({
      key: "genscape",
      label: "GENSCAPE",
      navItems: [
        { id: "watchlists", label: "Watchlists", group: "Watchlists" },
        { id: "watchlist-editor", label: "Manage Watchlists", group: "Watchlists" },
        { id: "genscape-noms", label: "Historical Noms", group: "Noms" },
      ],
    });
  }

  if (enabled.iceCash) {
    sections.push({
      key: "ice",
      label: "ICE CASH PRICES",
      navItems: [
        { id: "cash-pricing-matrix", label: "Cash Pricing Matrix" },
      ],
    });
  }

  return sections;
}

export default function Sidebar({
  activeSection,
  onSectionChange,
  enabled,
}: SidebarProps) {
  const topSections = getSections(enabled);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(topSections.map((s) => [s.key, true]))
  );

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <aside className="flex w-[210px] flex-shrink-0 flex-col border-r border-gray-800 bg-[#0b0d14]">
      {/* Header */}
      <div className="px-4 pt-5 pb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">
          Helios CTA
        </p>
        <p className="mt-0.5 text-sm font-bold text-gray-100">Gas Markets</p>
      </div>

      <div className="mx-3 h-px bg-gray-800" />

      {/* Home */}
      <div className="px-2 pt-3 pb-1">
        <button
          onClick={() => onSectionChange("home")}
          className={`flex w-full items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            activeSection === "home"
              ? "bg-gray-800/60 text-white"
              : "text-gray-400 hover:bg-gray-800/40 hover:text-gray-200"
          }`}
        >
          Home
        </button>
      </div>

      {/* Collapsible Sections */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {topSections.map((section) => {
          const isExpanded = expandedSections[section.key] ?? true;
          return (
            <div key={section.key}>
              {/* Section header toggle */}
              <button
                onClick={() => toggleSection(section.key)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-gray-800/30"
              >
                <span className="text-xs font-bold text-white">
                  {section.label}
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-3 w-3 text-gray-600 transition-transform ${isExpanded ? "rotate-0" : "-rotate-90"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Nav items */}
              {isExpanded && (
                <div className="mt-0.5 space-y-0.5 pb-1">
                  {section.navItems.map((item, i) => {
                    const isActive = activeSection === item.id;
                    const prevGroup = i > 0 ? section.navItems[i - 1].group : undefined;
                    const showGroupHeader = item.group && item.group !== prevGroup;
                    return (
                      <div key={item.id}>
                        {showGroupHeader && (
                          <p
                            className={`px-3 text-[9px] font-bold uppercase tracking-wider text-gray-600 ${
                              i > 0 ? "mt-2 border-t border-gray-800/40 pt-2" : ""
                            } mb-0.5`}
                          >
                            {item.group}
                          </p>
                        )}
                        <button
                          onClick={() => onSectionChange(item.id)}
                          className={`flex w-full items-center rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                            isActive
                              ? "bg-gray-800/60 text-white"
                              : "text-gray-400 hover:bg-gray-800/40 hover:text-gray-200"
                          }`}
                        >
                          {item.label}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-800 px-4 py-3">
        <p className="text-[10px] text-gray-600">Source: Azure SQL</p>
      </div>
    </aside>
  );
}
