"use client";

import { useState } from "react";
import Sidebar, { type ActiveSection } from "@/components/Sidebar";
import GenscapeNomsTable from "@/components/gas/GenscapeNomsTable";

const SECTION_META: Record<ActiveSection, { title: string; subtitle: string; footer: string }> = {
  "genscape-noms": {
    title: "Genscape Nominations",
    subtitle: "Historical nominations data from Genscape across all pipelines.",
    footer: "Genscape Noms | Source: Azure SQL",
  },
};

export default function HomePageClient() {
  const [activeSection, setActiveSection] = useState<ActiveSection>("genscape-noms");
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
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 shadow-2xl">
            <GenscapeNomsTable />
          </div>
          <p className="mt-6 text-center text-xs text-gray-600">{meta.footer}</p>
        </main>
      </div>
    </div>
  );
}
