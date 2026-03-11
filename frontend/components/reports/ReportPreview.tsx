"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type {
  StructuredReport, ReportSection, NarrativeSection, MetricCardSection,
  TableSection, ChartSection, SignalSection, Trend, SignalDirection,
} from "@/lib/types/report";

// ── Color helpers ──

const SIGNAL_COLORS: Record<SignalDirection, string> = {
  bullish: "text-emerald-400",
  bearish: "text-red-400",
  neutral: "text-gray-400",
};

const SIGNAL_BG: Record<SignalDirection, string> = {
  bullish: "bg-emerald-500/10 border-emerald-500/30",
  bearish: "bg-red-500/10 border-red-500/30",
  neutral: "bg-gray-500/10 border-gray-500/30",
};

const TREND_ARROWS: Record<Trend, string> = {
  up: "\u2191",
  down: "\u2193",
  flat: "\u2192",
};

const TREND_COLORS: Record<Trend, string> = {
  up: "text-emerald-400",
  down: "text-red-400",
  flat: "text-gray-400",
};

const DEFAULT_CHART_COLORS = [
  "#06b6d4", "#a78bfa", "#f59e0b", "#10b981", "#ef4444", "#6366f1",
];

// ── Format helpers ──

function formatCellValue(value: unknown, format?: string): string {
  if (value == null) return "—";
  const v = value as number | string;
  switch (format) {
    case "currency":
      return typeof v === "number" ? `$${v.toFixed(2)}` : String(v);
    case "percent":
      return typeof v === "number" ? `${(v * 100).toFixed(1)}%` : String(v);
    case "number":
      return typeof v === "number" ? v.toLocaleString() : String(v);
    case "date":
      return String(v).slice(0, 10);
    default:
      return String(v);
  }
}

// ── Section renderers ──

function NarrativeView({ section }: { section: NarrativeSection }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none text-gray-200">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {section.markdown}
      </ReactMarkdown>
    </div>
  );
}

function MetricCardView({ section }: { section: MetricCardSection }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {section.metrics.map((m, i) => (
        <div
          key={i}
          className="rounded-lg border border-gray-800 bg-[#12141d] p-3"
        >
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
            {m.label}
          </p>
          <p className="mt-1 text-lg font-bold text-gray-100">{m.value}</p>
          {(m.delta || m.trend) && (
            <div className="mt-1 flex items-center gap-1.5">
              {m.trend && (
                <span className={`text-sm font-bold ${TREND_COLORS[m.trend]}`}>
                  {TREND_ARROWS[m.trend]}
                </span>
              )}
              {m.delta && (
                <span className="text-xs text-gray-400">{m.delta}</span>
              )}
              {m.signal && (
                <span className={`text-[10px] font-medium ${SIGNAL_COLORS[m.signal]}`}>
                  {m.signal}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TableView({ section }: { section: TableSection }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            {section.columns.map((col) => (
              <th
                key={col.key}
                className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-gray-800/50 hover:bg-gray-800/20"
            >
              {section.columns.map((col) => (
                <td key={col.key} className="px-3 py-2 text-gray-300">
                  {formatCellValue(row[col.key], col.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartView({ section }: { section: ChartSection }) {
  const renderSeries = (s: ChartSection["series"][number], idx: number) => {
    const color = s.color || DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length];
    const seriesType = s.type || section.chartType;
    switch (seriesType) {
      case "bar":
        return <Bar key={s.key} dataKey={s.key} name={s.label} fill={color} />;
      case "area":
        return <Area key={s.key} dataKey={s.key} name={s.label} stroke={color} fill={color} fillOpacity={0.15} />;
      default:
        return <Line key={s.key} dataKey={s.key} name={s.label} stroke={color} dot={false} strokeWidth={2} />;
    }
  };

  const commonProps = {
    data: section.data,
    margin: { top: 5, right: 20, left: 10, bottom: 5 },
  };

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
      <XAxis dataKey={section.xKey} tick={{ fill: "#9ca3af", fontSize: 11 }} stroke="#374151" />
      <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} stroke="#374151" />
      <Tooltip
        contentStyle={{ backgroundColor: "#12141d", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
        labelStyle={{ color: "#9ca3af" }}
      />
      <Legend wrapperStyle={{ fontSize: 11 }} />
    </>
  );

  let chart: React.ReactNode;
  switch (section.chartType) {
    case "bar":
      chart = (
        <BarChart {...commonProps}>
          {axes}
          {section.series.map(renderSeries)}
        </BarChart>
      );
      break;
    case "area":
      chart = (
        <AreaChart {...commonProps}>
          {axes}
          {section.series.map(renderSeries)}
        </AreaChart>
      );
      break;
    case "composed":
      chart = (
        <ComposedChart {...commonProps}>
          {axes}
          {section.series.map(renderSeries)}
        </ComposedChart>
      );
      break;
    default:
      chart = (
        <LineChart {...commonProps}>
          {axes}
          {section.series.map(renderSeries)}
        </LineChart>
      );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      {chart}
    </ResponsiveContainer>
  );
}

function SignalView({ section }: { section: SignalSection }) {
  const pct = Math.round(section.confidence * 100);
  return (
    <div className={`rounded-lg border p-4 ${SIGNAL_BG[section.direction]}`}>
      <div className="flex items-center gap-3">
        <span className={`text-2xl font-bold uppercase ${SIGNAL_COLORS[section.direction]}`}>
          {section.direction}
        </span>
        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
          {pct}% confidence
        </span>
      </div>
      <p className="mt-2 text-sm text-gray-300">{section.rationale}</p>
    </div>
  );
}

function SectionRenderer({ section }: { section: ReportSection }) {
  let body: React.ReactNode;
  switch (section.type) {
    case "narrative":
      body = <NarrativeView section={section} />;
      break;
    case "metric_card":
      body = <MetricCardView section={section} />;
      break;
    case "table":
      body = <TableView section={section} />;
      break;
    case "chart":
      body = <ChartView section={section} />;
      break;
    case "signal":
      body = <SignalView section={section} />;
      break;
    default:
      body = null;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-200">{section.title}</h3>
      {body}
    </div>
  );
}

// ── Main component ──

interface ReportPreviewProps {
  report: StructuredReport;
}

export default function ReportPreview({ report }: ReportPreviewProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-800 pb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-100">{report.title}</h2>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase ${SIGNAL_BG[report.overall_signal]} ${SIGNAL_COLORS[report.overall_signal]}`}
          >
            {report.overall_signal}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">Trade date: {report.trade_date}</p>
        <p className="mt-2 text-sm text-gray-400">{report.summary}</p>
      </div>

      {/* Sections */}
      {report.sections.map((section, i) => (
        <SectionRenderer key={i} section={section} />
      ))}
    </div>
  );
}
