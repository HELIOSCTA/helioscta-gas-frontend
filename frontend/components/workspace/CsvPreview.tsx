"use client";

import { useState, useMemo } from "react";

interface CsvPreviewProps {
  content: string;
}

function parseCsv(raw: string): { headers: string[]; rows: string[][] } {
  const lines = raw.trim().split("\n");
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) =>
    line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""))
  );
  return { headers, rows };
}

const PAGE_SIZE = 50;

export default function CsvPreview({ content }: CsvPreviewProps) {
  const [page, setPage] = useState(0);
  const { headers, rows } = useMemo(() => parseCsv(content), [content]);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (headers.length === 0) {
    return (
      <p className="px-6 py-4 text-sm text-gray-500">Empty CSV file</p>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[#0b0d14]">
            <tr>
              <th className="border-b border-gray-800 px-3 py-2 text-left font-semibold text-gray-500">
                #
              </th>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="border-b border-gray-800 px-3 py-2 text-left font-semibold text-gray-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-gray-800/50 transition-colors hover:bg-gray-800/30"
              >
                <td className="px-3 py-1.5 text-gray-600">
                  {page * PAGE_SIZE + ri + 1}
                </td>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-gray-300">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-800 px-4 py-2">
          <span className="text-[10px] text-gray-500">
            {rows.length} rows &middot; Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded px-2 py-0.5 text-[10px] text-gray-400 hover:bg-gray-800 disabled:opacity-30"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="rounded px-2 py-0.5 text-[10px] text-gray-400 hover:bg-gray-800 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
