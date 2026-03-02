function envBool(key: string, fallback = false): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val === "true" || val === "1";
}

/** Feature flags — set via NEXT_PUBLIC_* env vars, default to true */
export const WORKBENCH_V2_ENABLED = envBool("NEXT_PUBLIC_WORKBENCH_V2_ENABLED", true);
export const ANALYSIS_PACKS_ENABLED = envBool("NEXT_PUBLIC_ANALYSIS_PACKS_ENABLED", true);
export const SQL_RUNNER_ENABLED = envBool("NEXT_PUBLIC_SQL_RUNNER_ENABLED", true);
export const EVIDENCE_LINKS_ENABLED = envBool("NEXT_PUBLIC_EVIDENCE_LINKS_ENABLED", true);
export const COST_DISPLAY_ENABLED = envBool("NEXT_PUBLIC_COST_DISPLAY_ENABLED", true);
export const TOKEN_GUARDRAILS_ENABLED = envBool("NEXT_PUBLIC_TOKEN_GUARDRAILS_ENABLED", true);
export const MODEL_ROUTER_ENABLED = envBool("NEXT_PUBLIC_MODEL_ROUTER_ENABLED", false);
