"use client";

import { useState, useEffect, useMemo } from "react";
import { DATASET_DISCOVERY_ENABLED } from "@/lib/feature-flags";

interface CatalogTable {
  schema_name: string;
  table_name: string;
  column_count: number;
  columns?: { column_name: string; data_type: string }[];
}

interface DatasetCatalogProps {
  onSelectTable?: (schema: string, table: string) => void;
  onInjectContext?: (context: string) => void;
}

export default function DatasetCatalog({ onSelectTable, onInjectContext }: DatasetCatalogProps) {
  const [tables, setTables] = useState<CatalogTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  useEffect(() => {
    if (!DATASET_DISCOVERY_ENABLED) return;
    setLoading(true);
    fetch("/api/datasets/catalog")
      .then((r) => r.json())
      .then((data) => setTables(data.tables ?? []))
      .catch((err) => console.error("Failed to fetch catalog:", err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return tables;
    const q = search.toLowerCase();
    return tables.filter(
      (t) =>
        t.table_name.toLowerCase().includes(q) ||
        t.schema_name.toLowerCase().includes(q)
    );
  }, [tables, search]);

  // Group by schema
  const grouped = useMemo(() => {
    const map = new Map<string, CatalogTable[]>();
    for (const t of filtered) {
      const existing = map.get(t.schema_name) ?? [];
      existing.push(t);
      map.set(t.schema_name, existing);
    }
    return map;
  }, [filtered]);

  if (!DATASET_DISCOVERY_ENABLED) return null;

  const handleInject = (table: CatalogTable) => {
    const ctx = `Available table: ${table.schema_name}.${table.table_name}` +
      (table.columns ? ` (columns: ${table.columns.map((c) => `${c.column_name} ${c.data_type}`).join(", ")})` : "");
    onInjectContext?.(ctx);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-800 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
          Dataset Catalog
        </p>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tables..."
          className="mt-1.5 w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:border-gray-500 focus:outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {loading && (
          <p className="px-3 py-2 text-xs text-gray-500 animate-pulse">Loading catalog...</p>
        )}

        {!loading && filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-gray-600">No tables found</p>
        )}

        {Array.from(grouped.entries()).map(([schema, schemaTables]) => (
          <div key={schema} className="mb-1">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              {schema}
            </p>
            {schemaTables.map((t) => {
              const key = `${t.schema_name}.${t.table_name}`;
              const isExpanded = expandedTable === key;

              return (
                <div key={key}>
                  <div className="flex items-center group">
                    <button
                      onClick={() => setExpandedTable(isExpanded ? null : key)}
                      className="flex flex-1 items-center gap-2 px-3 py-1 text-left text-xs text-gray-400 hover:bg-gray-800/30 hover:text-gray-300"
                    >
                      <span className="inline-flex h-4 w-6 items-center justify-center rounded text-[8px] font-bold text-orange-400 bg-gray-800/60">
                        TBL
                      </span>
                      <span className="truncate">{t.table_name}</span>
                      <span className="ml-auto text-[9px] text-gray-600">{t.column_count} cols</span>
                    </button>
                    <button
                      onClick={() => { handleInject(t); onSelectTable?.(t.schema_name, t.table_name); }}
                      className="px-2 py-1 text-[10px] text-cyan-500 opacity-0 group-hover:opacity-100 hover:text-cyan-400"
                      title="Add to chat context"
                    >
                      +ctx
                    </button>
                  </div>

                  {isExpanded && t.columns && (
                    <div className="ml-8 mb-1">
                      {t.columns.map((col) => (
                        <div key={col.column_name} className="flex items-center gap-2 px-2 py-0.5 text-[10px]">
                          <span className="text-gray-500">{col.column_name}</span>
                          <span className="text-gray-700">{col.data_type}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
