/** Run-level status */
export type RunStatus = "pending" | "running" | "completed" | "failed" | "finalized";

/** Step-level status */
export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

/** Ordered pipeline step names */
export type StepName =
  | "load_inputs"
  | "execute_sql"
  | "compute_metrics"
  | "build_context"
  | "generate_report"
  | "evidence_link";

export const PACK_STEPS: StepName[] = [
  "load_inputs",
  "execute_sql",
  "compute_metrics",
  "build_context",
  "generate_report",
  "evidence_link",
];

export interface AnalysisPack {
  pack_id: number;
  workspace_id: number;
  slug: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PackInput {
  input_id: number;
  pack_id: number;
  input_type: string;
  file_path: string;
  required: boolean;
  dialect: string | null;
  display_label: string | null;
  sort_order: number;
  category: string | null;
  relative_path: string | null;
}

export interface PackRun {
  run_id: number;
  pack_id: number;
  run_date: string;
  trade_date: string | null;
  status: RunStatus;
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  error_summary: string | null;
  run_output_path: string | null;
}

export interface RunArtifactPathMap {
  root: string;
  logs: string;
  sqlResults: string;
  sqlExecuted: string;
  drafts: string;
  reports: string;
  evidence: string;
  analysisDraftMd: string;
  reportDataJson: string;
  reportMd: string;
  reportHtml: string;
  evidenceLinksJson: string;
  runLogPath: string;
  stepLogTemplate: string;
}

export interface PackRunStep {
  step_id: number;
  run_id: number;
  step_name: StepName;
  step_order: number;
  status: StepStatus;
  started_at: string | null;
  completed_at: string | null;
  log_text: string | null;
  output_json: Record<string, unknown> | null;
  retry_count: number;
}

export interface SqlRun {
  sql_run_id: number;
  run_id: number | null;
  workspace_id: number | null;
  step_id: number | null;
  dialect: "postgresql" | "mssql";
  sql_text: string;
  executed_by: string | null;
  status: string;
  row_count: number | null;
  elapsed_ms: number | null;
  truncated: boolean;
  error_text: string | null;
  result_json: Record<string, unknown> | null;
  created_at: string;
}

export interface ReportArtifact {
  artifact_id: number;
  run_id: number;
  artifact_type: string;
  workspace_file_id: number | null;
  blob_path: string | null;
  generated_by: string | null;
  created_at: string;
}

export interface EvidenceLink {
  evidence_id: number;
  run_id: number;
  section_key: string;
  claim_text: string | null;
  sql_run_id: number | null;
  workspace_file_id: number | null;
  created_at: string;
}

export interface RunLogEntry {
  id: string;
  timestamp: string;
  stepName: StepName | "system";
  level: "info" | "warn" | "error";
  message: string;
  detail?: Record<string, unknown>;
}

export interface WorkbenchError {
  id: string;
  timestamp: string;
  source: "step" | "sql" | "frontend";
  stepName?: StepName;
  message: string;
  detail?: string;
  runId?: number;
  stepId?: number;
  sqlRunId?: number;
}

// --- Structured Report Types ---

export interface StructuredReport {
  version: 1;
  pack_slug: string;
  trade_date: string;
  generated_at: string;
  run_id: number;
  title: string;
  summary: string;
  overall_signal: "bullish" | "bearish" | "neutral" | "mixed";
  sections: ReportSection[];
}

export type ReportSection =
  | NarrativeSection
  | MetricCardSection
  | TableSection
  | ChartSection
  | SignalSection;

export interface SectionBase {
  section_key: string;
  heading: string;
  subheading?: string;
  evidence_sql_run_ids?: number[];
}

export interface NarrativeSection extends SectionBase {
  type: "narrative";
  markdown: string;
}

export interface MetricCardSection extends SectionBase {
  type: "metric_card";
  metrics: {
    label: string;
    value: string;
    value_numeric?: number;
    unit?: string;
    delta?: string;
    delta_numeric?: number;
    trend?: "up" | "down" | "flat";
    signal?: "bullish" | "bearish" | "neutral";
    sparkline?: number[];
  }[];
}

export interface TableSection extends SectionBase {
  type: "table";
  columns: {
    key: string;
    header: string;
    dtype: "string" | "number" | "currency" | "percent" | "date";
    decimals?: number;
    align?: "left" | "right" | "center";
  }[];
  rows: Record<string, string | number | null>[];
  caption?: string;
  max_display_rows?: number;
}

export interface ChartSection extends SectionBase {
  type: "chart";
  chart_type: "line" | "bar" | "area" | "composed";
  data: Record<string, string | number | null>[];
  x_axis: { dataKey: string; label?: string };
  y_axes: { id?: string; label?: string; orientation?: "left" | "right" }[];
  series: {
    dataKey: string;
    name: string;
    type?: "line" | "bar" | "area";
    color: string;
    yAxisId?: string;
  }[];
  height?: number;
  reference_lines?: { y?: number; x?: string; label: string; stroke?: string }[];
}

export interface SignalSection extends SectionBase {
  type: "signal";
  signals: {
    direction: "bullish" | "bearish" | "neutral";
    label: string;
    detail: string;
    confidence?: "high" | "medium" | "low";
  }[];
}

export interface MetricsOutput {
  version: 1;
  trade_date: string;
  computed_at: string;
  source_sql_run_ids: number[];
  groups: {
    group_key: string;
    label: string;
    values: {
      key: string;
      label: string;
      current: number | null;
      prior: number | null;
      delta: number | null;
      delta_pct: number | null;
      unit: string;
    }[];
  }[];
}
