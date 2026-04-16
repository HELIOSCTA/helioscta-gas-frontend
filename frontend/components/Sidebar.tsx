"use client";

import { useState } from "react";

export type ActiveSection =
  | "home"
  | "genscape-noms"
  | "noms-movements"
  | "watchlists"
  | "watchlist-editor"
  | "cash-pricing-matrix"
  | "pjm-lmp-prices"
  | "pjm-load-forecast";

interface SidebarProps {
  activeSection: ActiveSection;
  onSectionChange: (section: ActiveSection) => void;
  enabled: {
    genscape: boolean;
    iceCash: boolean;
    pjm: boolean;
  };
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface NavItem {
  id: ActiveSection;
  label: string;
  group?: string;
  disabled?: boolean;
}

interface TopSection {
  key: string;
  label: string;
  navItems: NavItem[];
}

function getSections(enabled: SidebarProps["enabled"]): TopSection[] {
  const sections: TopSection[] = [];

  if (enabled.iceCash) {
    sections.push({
      key: "ice",
      label: "PRICING",
      navItems: [
        { id: "cash-pricing-matrix", label: "Cash Pricing Matrix" },
      ],
    });
  }

  if (enabled.genscape) {
    sections.push({
      key: "genscape",
      label: "GENSCAPE",
      navItems: [
        { id: "watchlist-editor", label: "Manage Watchlists" },
        { id: "watchlists", label: "Watchlists" },
        { id: "genscape-noms", label: "Historical Noms" },
        { id: "noms-movements", label: "Nom Movements", disabled: true },
      ],
    });
  }

  if (enabled.pjm) {
    sections.push({
      key: "pjm",
      label: "PJM POWER",
      navItems: [
        { id: "pjm-lmp-prices", label: "LMP Prices" },
        { id: "pjm-load-forecast", label: "Forecasts" },
      ],
    });
  }

  return sections;
}

export default function Sidebar({
  activeSection,
  onSectionChange,
  enabled,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const topSections = getSections(enabled);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(topSections.map((s) => [s.key, true]))
  );

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSectionChange = (section: ActiveSection) => {
    onSectionChange(section);
    onMobileClose?.();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={onMobileClose}
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-gray-800 bg-[#0b0d14] transition-transform md:static md:w-[210px] md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">
            Helios CTA
          </p>
          <p className="mt-0.5 text-sm font-bold text-gray-100">Gas Markets</p>
        </div>
        <button
          onClick={onMobileClose}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-200 md:hidden"
          aria-label="Close navigation"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="mx-3 h-px bg-gray-800" />

      {/* Home */}
      <div className="px-2 pt-3 pb-1">
        <button
          onClick={() => handleSectionChange("home")}
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
                          onClick={() => !item.disabled && handleSectionChange(item.id)}
                          disabled={item.disabled}
                          className={`flex w-full items-center rounded-md px-3 py-2 text-[13px] font-medium transition-colors md:py-1.5 ${
                            item.disabled
                              ? "cursor-not-allowed text-gray-600"
                              : isActive
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
    </>
  );
}
