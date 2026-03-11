/* ──────────────────────────────────────────────────────────────
   StructuredReport — schema for AI-generated daily reports
   ────────────────────────────────────────────────────────── */

export type SignalDirection = "bullish" | "bearish" | "neutral";
export type Trend = "up" | "down" | "flat";

// ── Section types ──

export interface NarrativeSection {
  type: "narrative";
  title: string;
  markdown: string;
}

export interface MetricCard {
  label: string;
  value: string;
  delta?: string;
  trend?: Trend;
  signal?: SignalDirection;
}

export interface MetricCardSection {
  type: "metric_card";
  title: string;
  metrics: MetricCard[];
}

export interface ColumnDef {
  key: string;
  label: string;
  format?: "string" | "number" | "currency" | "percent" | "date";
}

export interface TableSection {
  type: "table";
  title: string;
  columns: ColumnDef[];
  rows: Record<string, unknown>[];
}

export interface ChartSeries {
  key: string;
  label: string;
  color?: string;
  type?: "line" | "bar" | "area";
}

export interface ChartSection {
  type: "chart";
  title: string;
  chartType: "line" | "bar" | "area" | "composed";
  xKey: string;
  series: ChartSeries[];
  data: Record<string, unknown>[];
}

export interface SignalSection {
  type: "signal";
  title: string;
  direction: SignalDirection;
  confidence: number; // 0–1
  rationale: string;
}

export type ReportSection =
  | NarrativeSection
  | MetricCardSection
  | TableSection
  | ChartSection
  | SignalSection;

// ── Top-level report ──

export interface StructuredReport {
  version: 1;
  title: string;
  summary: string;
  overall_signal: SignalDirection;
  trade_date: string; // YYYY-MM-DD
  sections: ReportSection[];
}

// ── Saved report row (from DB) ──

export interface SavedReportRow {
  report_id: number;
  conversation_id: number | null;
  agent_id: string | null;
  title: string;
  trade_date: string;
  overall_signal: string | null;
  created_by: string | null;
  created_at: string;
}
