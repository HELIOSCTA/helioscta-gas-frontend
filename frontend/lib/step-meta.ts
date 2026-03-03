import type { StepName } from "@/lib/types/analysis";

export const STEP_META: Record<StepName, { label: string; icon: string }> = {
  load_inputs:     { label: "Load Inputs",     icon: "📥" },
  execute_sql:     { label: "Execute SQL",     icon: "🗄️" },
  compute_metrics: { label: "Compute Metrics", icon: "📊" },
  build_context:   { label: "Build Context",   icon: "📝" },
  generate_report: { label: "Generate Report", icon: "📄" },
  evidence_link:   { label: "Evidence Links",  icon: "🔗" },
};

export const STEP_ORDER: StepName[] = [
  "load_inputs",
  "execute_sql",
  "compute_metrics",
  "build_context",
  "generate_report",
  "evidence_link",
];
