"use client";

import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  AreaChart,
  ComposedChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import type {
  StructuredReport,
  ReportSection,
  NarrativeSection,
  MetricCardSection,
  TableSection,
  ChartSection,
  SignalSection,
} from "@/lib/types/analysis";

interface ReportPreviewProps {
  runId: number;
  onEvidenceClick?: (sectionKey: string) => void;
}

const SIGNAL_COLORS = {
  bullish: "text-emerald-400",
  bearish: "text-red-400",
  neutral: "text-gray-400",
  mixed: "text-amber-400",
};

const SIGNAL_BG = {
  bullish: "bg-emerald-900/30 border-emerald-700/50",
  bearish: "bg-red-900/30 border-red-700/50",
  neutral: "bg-gray-800/50 border-gray-700/50",
  mixed: "bg-amber-900/30 border-amber-700/50",
};

const TREND_ICONS = { up: "\u2191", down: "\u2193", flat: "\u2192" };

function NarrativeRenderer({ section }: { section: NarrativeSection }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-headings:text-gray-100 prose-p:text-gray-300 prose-a:text-cyan-400">
      <div dangerouslySetInnerHTML={{ __html: markdownToHtml(section.markdown) }} />
    </div>
  );
}

function MetricCardRenderer({ section }: { section: MetricCardSection }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {section.metrics.map((m, i) => (
        <div key={i} className="rounded-lg border border-gray-700 bg-[#12141d] p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{m.label}</p>
          <p className="mt-1 text-lg font-bold text-gray-100">
            {m.value}
            {m.unit && <span className="ml-1 text-xs text-gray-500">{m.unit}</span>}
          </p>
          {m.delta && (
            <p className={`mt-0.5 text-xs font-medium ${
              m.signal === "bullish" ? "text-emerald-400" :
              m.signal === "bearish" ? "text-red-400" : "text-gray-500"
            }`}>
              {m.trend ? TREND_ICONS[m.trend] : ""} {m.delta}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function TableRenderer({ section }: { section: TableSection }) {
  const maxRows = section.max_display_rows ?? 50;
  const displayRows = section.rows.slice(0, maxRows);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-700">
            {section.columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 ${
                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, ri) => (
            <tr key={ri} className="border-b border-gray-800/50 hover:bg-gray-800/30">
              {section.columns.map((col) => {
                const val = row[col.key];
                let display = val == null ? "—" : String(val);
                if (col.dtype === "number" && typeof val === "number") {
                  display = val.toLocaleString(undefined, { maximumFractionDigits: col.decimals ?? 2 });
                } else if (col.dtype === "currency" && typeof val === "number") {
                  display = `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                } else if (col.dtype === "percent" && typeof val === "number") {
                  display = `${(val * 100).toFixed(col.decimals ?? 1)}%`;
                }
                return (
                  <td
                    key={col.key}
                    className={`px-3 py-1.5 text-gray-300 ${
                      col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                    }`}
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {section.caption && (
        <p className="mt-2 text-[10px] text-gray-600 italic">{section.caption}</p>
      )}
      {section.rows.length > maxRows && (
        <p className="mt-1 text-[10px] text-gray-600">
          Showing {maxRows} of {section.rows.length} rows
        </p>
      )}
    </div>
  );
}

function ChartRenderer({ section }: { section: ChartSection }) {
  const height = section.height ?? 300;

  const renderSeries = () =>
    section.series.map((s) => {
      const type = s.type ?? section.chart_type;
      const common = { dataKey: s.dataKey, name: s.name, stroke: s.color, fill: s.color, yAxisId: s.yAxisId ?? "left" };
      if (type === "bar") return <Bar key={s.dataKey} {...common} fillOpacity={0.7} />;
      if (type === "area") return <Area key={s.dataKey} {...common} fillOpacity={0.15} />;
      return <Line key={s.dataKey} {...common} dot={false} strokeWidth={2} />;
    });

  const renderAxes = () => (
    <>
      <XAxis dataKey={section.x_axis.dataKey} tick={{ fontSize: 10, fill: "#6b7280" }} label={section.x_axis.label ? { value: section.x_axis.label, position: "insideBottom", offset: -5, fill: "#6b7280", fontSize: 10 } : undefined} />
      {section.y_axes.map((ya, i) => (
        <YAxis key={i} yAxisId={ya.id ?? (i === 0 ? "left" : "right")} orientation={ya.orientation ?? (i === 0 ? "left" : "right")} tick={{ fontSize: 10, fill: "#6b7280" }} label={ya.label ? { value: ya.label, angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 10 } : undefined} />
      ))}
    </>
  );

  const renderRefLines = () =>
    (section.reference_lines ?? []).map((rl, i) => (
      <ReferenceLine key={i} y={rl.y} x={rl.x} label={{ value: rl.label, fill: rl.stroke ?? "#6b7280", fontSize: 10 }} stroke={rl.stroke ?? "#374151"} strokeDasharray="3 3" />
    ));

  const common = { data: section.data, margin: { top: 10, right: 20, left: 10, bottom: 20 } };
  const inner = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
      {renderAxes()}
      <Tooltip contentStyle={{ background: "#12141d", border: "1px solid #374151", borderRadius: 6, fontSize: 11 }} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      {renderSeries()}
      {renderRefLines()}
    </>
  );

  const ChartComp = section.chart_type === "bar" ? BarChart :
                     section.chart_type === "area" ? AreaChart :
                     section.chart_type === "composed" ? ComposedChart : LineChart;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ChartComp {...common}>{inner}</ChartComp>
      </ResponsiveContainer>
    </div>
  );
}

function SignalRenderer({ section }: { section: SignalSection }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {section.signals.map((sig, i) => (
        <div
          key={i}
          className={`rounded-lg border p-3 ${SIGNAL_BG[sig.direction]}`}
        >
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${SIGNAL_COLORS[sig.direction]}`}>
              {sig.direction === "bullish" ? "\u25B2" : sig.direction === "bearish" ? "\u25BC" : "\u25C6"}
            </span>
            <span className="text-xs font-medium text-gray-200">{sig.label}</span>
            {sig.confidence && (
              <span className="ml-auto rounded-full bg-gray-800 px-1.5 py-0.5 text-[9px] text-gray-500">
                {sig.confidence}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">{sig.detail}</p>
        </div>
      ))}
    </div>
  );
}

// Minimal markdown-to-html (supports headers, bold, italic, links, lists)
function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*<\/li>)/, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hulo])(.+)$/gm, "<p>$1</p>");
}

function renderSection(section: ReportSection, onEvidenceClick?: (key: string) => void) {
  const hasEvidence = section.evidence_sql_run_ids && section.evidence_sql_run_ids.length > 0;

  return (
    <div key={section.section_key} className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-200">{section.heading}</h3>
        {section.subheading && (
          <span className="text-[10px] text-gray-500">{section.subheading}</span>
        )}
        {hasEvidence && onEvidenceClick && (
          <button
            onClick={() => onEvidenceClick(section.section_key)}
            className="ml-auto text-[10px] text-cyan-500 hover:text-cyan-400"
            title="View evidence"
          >
            Evidence
          </button>
        )}
      </div>
      {section.type === "narrative" && <NarrativeRenderer section={section} />}
      {section.type === "metric_card" && <MetricCardRenderer section={section} />}
      {section.type === "table" && <TableRenderer section={section} />}
      {section.type === "chart" && <ChartRenderer section={section} />}
      {section.type === "signal" && <SignalRenderer section={section} />}
    </div>
  );
}

export default function ReportPreview({ runId, onEvidenceClick }: ReportPreviewProps) {
  const [report, setReport] = useState<StructuredReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/analysis-runs/${runId}/report`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setReport(data.report ?? data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="animate-pulse text-xs text-gray-500">Loading report...</span>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-gray-600">{error ?? "No report available"}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-4">
      {/* Report header */}
      <div className="mb-6 border-b border-gray-800 pb-4">
        <h1 className="text-lg font-bold text-gray-100">{report.title}</h1>
        <div className="mt-1 flex items-center gap-3">
          <span className="text-xs text-gray-500">Trade Date: {report.trade_date}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SIGNAL_BG[report.overall_signal]} ${SIGNAL_COLORS[report.overall_signal]}`}>
            {report.overall_signal}
          </span>
        </div>
        {report.summary && (
          <p className="mt-2 text-xs text-gray-400">{report.summary}</p>
        )}
      </div>

      {/* Report sections */}
      {report.sections.map((section) => renderSection(section, onEvidenceClick))}
    </div>
  );
}
