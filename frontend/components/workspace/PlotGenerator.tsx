"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface PlotGeneratorProps {
  csvContent: string;
  blobPath?: string;
}

function parseColumns(csv: string): string[] {
  const firstLine = csv.trim().split("\n")[0];
  if (!firstLine) return [];
  return firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
}

export default function PlotGenerator({ csvContent, blobPath }: PlotGeneratorProps) {
  const columns = useMemo(() => parseColumns(csvContent), [csvContent]);
  const [xColumn, setXColumn] = useState(columns[0] ?? "");
  const [yColumns, setYColumns] = useState<string[]>(columns.length > 1 ? [columns[1]] : []);
  const [chartType, setChartType] = useState<"line" | "bar" | "scatter">("line");
  const [title, setTitle] = useState("Chart");
  const [plotData, setPlotData] = useState<{ data: object[]; layout: object } | null>(null);
  const [imageB64, setImageB64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleYColumn = (col: string) => {
    setYColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const handleGenerate = async () => {
    if (!xColumn || yColumns.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/workspace/plot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blob_path: blobPath,
          x_column: xColumn,
          y_columns: yColumns,
          chart_type: chartType,
          title,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error ?? "Plot generation failed");
        return;
      }

      const data = await res.json();
      setImageB64(data.image_base64);

      // Parse Plotly JSON for interactive chart
      if (data.plotly_json) {
        const plotly = JSON.parse(data.plotly_json);
        setPlotData({ data: plotly.data, layout: plotly.layout });
      }
    } catch (err) {
      setError("Failed to generate plot");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (columns.length === 0) return null;

  return (
    <div className="border-t border-gray-800 bg-[#0b0d14]">
      <div className="px-4 py-3">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Plot Generator
        </p>

        <div className="flex flex-wrap gap-3 mb-3">
          {/* X Column */}
          <div>
            <label className="mb-1 block text-[10px] text-gray-500">X Axis</label>
            <select
              value={xColumn}
              onChange={(e) => setXColumn(e.target.value)}
              className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:border-gray-500 focus:outline-none"
            >
              {columns.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Chart Type */}
          <div>
            <label className="mb-1 block text-[10px] text-gray-500">Type</label>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as "line" | "bar" | "scatter")}
              className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:border-gray-500 focus:outline-none"
            >
              <option value="line">Line</option>
              <option value="bar">Bar</option>
              <option value="scatter">Scatter</option>
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="mb-1 block text-[10px] text-gray-500">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:border-gray-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Y Columns (multi-select) */}
        <div className="mb-3">
          <label className="mb-1 block text-[10px] text-gray-500">Y Columns</label>
          <div className="flex flex-wrap gap-1">
            {columns
              .filter((c) => c !== xColumn)
              .map((c) => (
                <button
                  key={c}
                  onClick={() => toggleYColumn(c)}
                  className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                    yColumns.includes(c)
                      ? "bg-cyan-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {c}
                </button>
              ))}
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || yColumns.length === 0}
          className="rounded bg-cyan-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-40"
        >
          {loading ? "Generating..." : "Generate Plot"}
        </button>

        {error && (
          <p className="mt-2 text-xs text-red-400">{error}</p>
        )}
      </div>

      {/* Plot display */}
      {plotData && (
        <div className="border-t border-gray-800 p-4">
          <Plot
            data={plotData.data as Plotly.Data[]}
            layout={{
              ...(plotData.layout as Partial<Plotly.Layout>),
              autosize: true,
            }}
            config={{ responsive: true, displayModeBar: true }}
            style={{ width: "100%", height: "400px" }}
            useResizeHandler
          />
        </div>
      )}

      {/* Fallback static image */}
      {imageB64 && !plotData && (
        <div className="border-t border-gray-800 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${imageB64}`}
            alt={title}
            className="max-w-full rounded border border-gray-800"
          />
        </div>
      )}
    </div>
  );
}
