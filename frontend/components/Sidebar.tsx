"use client";

import { useState } from "react";

export type ActiveSection = "genscape-noms";

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

const NAV_ITEMS: NavItem[] = [
  {
    id: "genscape-noms",
    label: "Genscape Noms",
    iconPath: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    iconColor: "text-purple-400",
  },
];

export default function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex flex-col border-r border-gray-800 bg-[#0b0d14] transition-all duration-200 ${
        collapsed ? "w-14" : "w-56"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-4">
        {!collapsed && (
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Helios CTA
          </span>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-2">
        {!collapsed && (
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
            Genscape
          </p>
        )}
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  collapsed ? "justify-center px-0" : ""
                } ${
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
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="border-t border-gray-800 px-3 py-3">
          <p className="text-[10px] text-gray-600">Source: Azure SQL</p>
        </div>
      )}
    </aside>
  );
}
