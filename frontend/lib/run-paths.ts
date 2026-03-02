/**
 * Run-scoped blob path builder - single source of truth for artifact paths.
 */

import type { RunArtifactPathMap } from "@/lib/types/analysis";

/** All subfolder names within a run output root */
export const RUN_SUBFOLDERS = {
  logs: "logs",
  sqlResults: "sql/results",
  sqlExecuted: "sql/executed",
  drafts: "drafts",
  reports: "reports",
  evidence: "evidence",
} as const;

export type RunSubfolder = (typeof RUN_SUBFOLDERS)[keyof typeof RUN_SUBFOLDERS];

function normalizeDate(runDate: string | Date): string {
  return typeof runDate === "string"
    ? runDate.slice(0, 10)
    : runDate.toISOString().slice(0, 10);
}

/**
 * Build the canonical run output root.
 * Format: `.prompts/{packSlug}/runs/{YYYY-MM-DD}/run_{runId}`
 */
export function buildRunOutputRoot(
  packSlug: string,
  runDate: string | Date,
  runId: number
): string {
  const dateStr = normalizeDate(runDate);
  return `.prompts/${packSlug}/runs/${dateStr}/run_${runId}`;
}

/**
 * Build the legacy run output root.
 * Format: `projects/{wsSlug}/runs/{YYYY-MM-DD}/run_{runId}`
 */
export function buildLegacyRunOutputRoot(
  wsSlug: string,
  runDate: string | Date,
  runId: number
): string {
  const dateStr = normalizeDate(runDate);
  return `projects/${wsSlug}/runs/${dateStr}/run_${runId}`;
}

export interface ResolveRunRootsInput {
  runOutputPath?: string | null;
  packSlug: string;
  wsSlug?: string | null;
  runDate: string | Date;
  runId: number;
}

/**
 * Canonical-first root candidates for hybrid migrations.
 */
export function resolveRunOutputRootCandidates(input: ResolveRunRootsInput): string[] {
  const candidates: string[] = [];
  const pushUnique = (p?: string | null) => {
    if (!p) return;
    if (!candidates.includes(p)) candidates.push(p);
  };

  pushUnique(buildRunOutputRoot(input.packSlug, input.runDate, input.runId));
  pushUnique(input.runOutputPath);
  if (input.wsSlug) {
    pushUnique(buildLegacyRunOutputRoot(input.wsSlug, input.runDate, input.runId));
  }
  return candidates;
}

/**
 * Build a full blob path for an artifact within a run.
 */
export function buildRunArtifactPath(
  root: string,
  subfolder: RunSubfolder,
  fileName: string
): string {
  return `${root}/${subfolder}/${fileName}`;
}

export function buildStepLogPath(root: string, stepName: string): string {
  return buildRunArtifactPath(root, RUN_SUBFOLDERS.logs, `step_${stepName}.log`);
}

/**
 * Build the complete artifact path map for a run.
 */
export function buildRunArtifactPathMap(root: string): RunArtifactPathMap {
  const logs = `${root}/${RUN_SUBFOLDERS.logs}`;
  const sqlResults = `${root}/${RUN_SUBFOLDERS.sqlResults}`;
  const sqlExecuted = `${root}/${RUN_SUBFOLDERS.sqlExecuted}`;
  const drafts = `${root}/${RUN_SUBFOLDERS.drafts}`;
  const reports = `${root}/${RUN_SUBFOLDERS.reports}`;
  const evidence = `${root}/${RUN_SUBFOLDERS.evidence}`;

  return {
    root,
    logs,
    sqlResults,
    sqlExecuted,
    drafts,
    reports,
    evidence,
    analysisDraftMd: `${drafts}/analysis_draft.md`,
    reportDataJson: `${reports}/report_data.json`,
    reportMd: `${reports}/report.md`,
    reportHtml: `${reports}/report.html`,
    evidenceLinksJson: `${evidence}/evidence_links.json`,
    runLogPath: `${logs}/run.log`,
    stepLogTemplate: `${logs}/step_<step_name>.log`,
  };
}
