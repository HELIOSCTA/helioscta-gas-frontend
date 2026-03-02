import { query } from "@/lib/db";
import { downloadBlob, uploadBlob } from "@/lib/blob";
import { executeSql } from "@/lib/sql-executor";
import { buildRunOutputRoot, buildRunArtifactPath, buildRunArtifactPathMap, RUN_SUBFOLDERS } from "@/lib/run-paths";
import type { RunArtifactPathMap } from "@/lib/types/analysis";
import { validatePackConvention } from "@/lib/pack-validator";
import type { StepName, PackRunStep, StructuredReport, MetricsOutput } from "@/lib/types/analysis";

/** Extract a useful message from any thrown value (handles Azure SDK errors, plain objects, etc.) */
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    const parts: string[] = [];
    if (e.statusCode) parts.push(`HTTP ${e.statusCode}`);
    if (e.code && e.code !== e.name) parts.push(e.code);
    // Use message only if it adds info beyond the class name
    const msg = e.message && e.message !== e.name ? e.message : null;
    // Azure RestError: check response body for details
    const bodyMsg = e.response?.parsedBody?.error?.message
      ?? e.response?.bodyAsText?.slice(0, 200)
      ?? e.details;
    if (msg) parts.push(msg);
    else if (bodyMsg) parts.push(String(bodyMsg).slice(0, 200));
    else parts.push(e.name || err.constructor.name);
    return parts.join(" — ") || `Unknown error (${err.constructor.name})`;
  }
  if (typeof err === "string") return err || "Unknown error (empty string)";
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    const candidate = obj.message || obj.code || obj.statusMessage || obj.error;
    if (candidate && typeof candidate === "string") return candidate;
    try {
      const json = JSON.stringify(err, null, 0);
      if (json && json !== "{}") return json.slice(0, 300);
    } catch { /* circular ref — fall through */ }
  }
  return "Unknown error (no message)";
}

/**
 * Execute a single step of a pack run.
 * Updates step status in the DB before and after execution.
 */
export async function executeStep(
  runId: number,
  stepName: StepName,
  userEmail: string
): Promise<PackRunStep> {
  // Mark step as running
  await query(
    `UPDATE helioscta_agents.pack_run_steps
     SET status = 'running', started_at = NOW()
     WHERE run_id = $1 AND step_name = $2`,
    [runId, stepName]
  );

  // Mark run as running
  await query(
    `UPDATE helioscta_agents.pack_runs SET status = 'running' WHERE run_id = $1 AND status = 'pending'`,
    [runId]
  );

  try {
    const handler = STEP_HANDLERS[stepName];
    if (!handler) throw new Error(`Unknown step: ${stepName}`);

    const output = await handler(runId, userEmail);

    // Mark step as completed
    await query(
      `UPDATE helioscta_agents.pack_run_steps
       SET status = 'completed', completed_at = NOW(), output_json = $3
       WHERE run_id = $1 AND step_name = $2`,
      [runId, stepName, JSON.stringify(output)]
    );

    // Check if all steps are completed
    const pending = await query(
      `SELECT COUNT(*) AS cnt FROM helioscta_agents.pack_run_steps
       WHERE run_id = $1 AND status NOT IN ('completed', 'skipped')`,
      [runId]
    );
    if (parseInt(pending.rows[0].cnt) === 0) {
      await query(
        `UPDATE helioscta_agents.pack_runs SET status = 'completed', completed_at = NOW() WHERE run_id = $1`,
        [runId]
      );
    }
  } catch (err) {
    const errorMsg = extractErrorMessage(err);
    await query(
      `UPDATE helioscta_agents.pack_run_steps
       SET status = 'failed', completed_at = NOW(), log_text = $3
       WHERE run_id = $1 AND step_name = $2`,
      [runId, stepName, errorMsg]
    );
    await query(
      `UPDATE helioscta_agents.pack_runs SET status = 'failed', error_summary = $2 WHERE run_id = $1`,
      [runId, errorMsg]
    );
  }

  // Return updated step
  const stepResult = await query<PackRunStep>(
    `SELECT * FROM helioscta_agents.pack_run_steps WHERE run_id = $1 AND step_name = $2`,
    [runId, stepName]
  );
  return stepResult.rows[0];
}

// --- Step handlers ---

type StepHandler = (runId: number, userEmail: string) => Promise<Record<string, unknown>>;

async function getRunContext(runId: number) {
  const run = await query(
    `SELECT r.*, p.workspace_id, p.slug AS pack_slug, w.slug AS ws_slug
     FROM helioscta_agents.pack_runs r
     JOIN helioscta_agents.analysis_packs p ON p.pack_id = r.pack_id
     JOIN helioscta_agents.workspaces w ON w.workspace_id = p.workspace_id
     WHERE r.run_id = $1`,
    [runId]
  );
  return run.rows[0];
}

/** Build run artifact paths from context, with fallback for legacy runs */
function getRunPaths(ctx: Record<string, unknown>): { root: string; paths: RunArtifactPathMap } {
  const root = (ctx.run_output_path as string) ||
    buildRunOutputRoot(ctx.ws_slug as string, ctx.run_date as string, ctx.run_id as number);
  return { root, paths: buildRunArtifactPathMap(root) };
}

const handleLoadInputs: StepHandler = async (runId) => {
  const ctx = await getRunContext(runId);
  const inputs = await query(
    `SELECT * FROM helioscta_agents.analysis_pack_inputs WHERE pack_id = $1 ORDER BY sort_order`,
    [ctx.pack_id]
  );

  const results: Record<string, { found: boolean; path: string }> = {};
  const inputPaths: string[] = [];

  for (const input of inputs.rows) {
    // Prefer relative_path (standardized), fall back to file_path (legacy)
    const lookupPath = input.relative_path || input.file_path;
    inputPaths.push(lookupPath);

    const fileCheck = await query(
      `SELECT file_id FROM helioscta_agents.workspace_files
       WHERE workspace_id = $1 AND blob_path LIKE $2 AND is_active = TRUE
       LIMIT 1`,
      [ctx.workspace_id, `%${lookupPath}`]
    );
    results[lookupPath] = {
      found: fileCheck.rows.length > 0,
      path: lookupPath,
    };
    if (input.required && fileCheck.rows.length === 0) {
      throw new Error(`Required input not found: ${lookupPath}`);
    }
  }

  // Query all workspace files for convention check
  const wsFiles = await query<{ parent_path: string; file_name: string }>(
    `SELECT parent_path, file_name FROM helioscta_agents.workspace_files
     WHERE workspace_id = $1 AND is_active = TRUE`,
    [ctx.workspace_id]
  );
  const allPaths = wsFiles.rows.map((f) =>
    ((f.parent_path || "/") + f.file_name).replace(/^\//, "")
  );

  // Run convention validator (warning-only)
  const conventionCheck = validatePackConvention(ctx.pack_slug, allPaths);

  return {
    inputs_checked: Object.keys(results).length,
    results,
    convention_warnings: conventionCheck.warnings,
  };
};

const handleExecuteSql: StepHandler = async (runId, userEmail) => {
  const ctx = await getRunContext(runId);
  const { root, paths } = getRunPaths(ctx);
  const sqlInputs = await query(
    `SELECT * FROM helioscta_agents.analysis_pack_inputs
     WHERE pack_id = $1 AND input_type = 'sql'
     ORDER BY sort_order`,
    [ctx.pack_id]
  );

  const step = await query(
    `SELECT step_id FROM helioscta_agents.pack_run_steps WHERE run_id = $1 AND step_name = 'execute_sql'`,
    [runId]
  );
  const stepId = step.rows[0]?.step_id;

  const results: Record<string, { status: string; rowCount: number; elapsedMs: number }> = {};

  for (const input of sqlInputs.rows) {
    // Prefer relative_path (standardized), fall back to file_path (legacy)
    const lookupPath = input.relative_path || input.file_path;

    // Read SQL from blob
    const fileRow = await query<{ blob_path: string }>(
      `SELECT blob_path FROM helioscta_agents.workspace_files
       WHERE workspace_id = $1 AND blob_path LIKE $2 AND is_active = TRUE
       LIMIT 1`,
      [ctx.workspace_id, `%${lookupPath}`]
    );
    if (fileRow.rows.length === 0) {
      throw new Error(`SQL file not found: ${lookupPath}`);
    }

    const sqlBuffer = await downloadBlob(fileRow.rows[0].blob_path);
    const sqlText = sqlBuffer.toString("utf-8");

    const execResult = await executeSql({
      dialect: input.dialect,
      sqlText,
    });

    // Record in sql_runs
    await query(
      `INSERT INTO helioscta_agents.sql_runs
         (run_id, workspace_id, step_id, dialect, sql_text, executed_by, status, row_count, elapsed_ms, truncated, error_text, result_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        runId,
        ctx.workspace_id,
        stepId,
        input.dialect,
        sqlText,
        userEmail,
        execResult.status === "success" ? "completed" : "failed",
        execResult.rowCount,
        execResult.elapsedMs,
        execResult.truncated,
        execResult.error ?? null,
        execResult.status === "success"
          ? JSON.stringify({ columns: execResult.columns, rows: execResult.rows })
          : null,
      ]
    );

    if (execResult.status !== "success") {
      throw new Error(`SQL execution failed for ${lookupPath}: ${execResult.error}`);
    }

    // Save results as CSV to run-scoped path
    if (execResult.rows.length > 0) {
      const csvName = lookupPath.replace(/\.sql$/, "_results.csv").replace(/^.*\//, "");
      const header = execResult.columns.join(",");
      const csvRows = execResult.rows.map((row) =>
        execResult.columns.map((c) => JSON.stringify(row[c] ?? "")).join(",")
      );
      const csvContent = [header, ...csvRows].join("\n");
      const blobPath = buildRunArtifactPath(root, RUN_SUBFOLDERS.sqlResults, csvName);
      const parentPath = `/${paths.sqlResults.split("/").slice(-2).join("/")}/`;

      await uploadBlob(blobPath, csvContent, "text/csv");

      await query(
        `INSERT INTO helioscta_agents.workspace_files
           (workspace_id, file_name, blob_path, file_type, mime_type, size_bytes, parent_path, source, created_by)
         VALUES ($1, $2, $3, 'csv', 'text/csv', $4, $5, 'sql_execution', $6)
         ON CONFLICT (blob_path) DO UPDATE SET size_bytes = EXCLUDED.size_bytes, updated_at = NOW(), is_active = TRUE`,
        [ctx.workspace_id, csvName, blobPath, Buffer.byteLength(csvContent), parentPath, userEmail]
      );
    }

    // Save executed SQL text to sql/executed/ subfolder
    const sqlFileName = lookupPath.replace(/^.*\//, "");
    const executedPath = buildRunArtifactPath(root, RUN_SUBFOLDERS.sqlExecuted, sqlFileName);
    await uploadBlob(executedPath, sqlText, "text/plain");

    results[lookupPath] = {
      status: execResult.status,
      rowCount: execResult.rowCount,
      elapsedMs: execResult.elapsedMs,
    };
  }

  return { sql_inputs_executed: Object.keys(results).length, results };
};

const handleComputeMetrics: StepHandler = async (runId) => {
  const ctx = await getRunContext(runId);
  const { root } = getRunPaths(ctx);

  // Gather completed SQL runs for this run
  const sqlRuns = await query<{ sql_run_id: number; result_json: string }>(
    `SELECT sql_run_id, result_json FROM helioscta_agents.sql_runs
     WHERE run_id = $1 AND status = 'completed' ORDER BY created_at`,
    [runId]
  );

  if (sqlRuns.rows.length === 0) {
    return { status: "skipped", message: "No SQL results to compute metrics from" };
  }

  const sourceIds = sqlRuns.rows.map((r) => r.sql_run_id);
  const groups: MetricsOutput["groups"] = [];

  for (const sr of sqlRuns.rows) {
    const parsed = typeof sr.result_json === "string" ? JSON.parse(sr.result_json) : sr.result_json;
    const rows = parsed?.rows ?? [];
    const columns: string[] = parsed?.columns ?? [];
    if (rows.length < 2) continue;

    // Identify numeric columns for delta computation
    const numericCols = columns.filter((col: string) => {
      const sample = rows[0]?.[col];
      return typeof sample === "number" || (typeof sample === "string" && !isNaN(Number(sample)) && sample !== "");
    });

    if (numericCols.length === 0) continue;

    const latest = rows[0];
    const prior = rows[1];
    const values = numericCols.map((col: string) => {
      const current = Number(latest[col]) || null;
      const priorVal = Number(prior[col]) || null;
      const delta = current != null && priorVal != null ? current - priorVal : null;
      const deltaPct = delta != null && priorVal != null && priorVal !== 0
        ? (delta / Math.abs(priorVal)) * 100
        : null;
      return {
        key: col,
        label: col.replace(/_/g, " "),
        current,
        prior: priorVal,
        delta,
        delta_pct: deltaPct != null ? Math.round(deltaPct * 100) / 100 : null,
        unit: "number",
      };
    });

    groups.push({
      group_key: `sql_run_${sr.sql_run_id}`,
      label: `SQL Run #${sr.sql_run_id}`,
      values,
    });
  }

  const metricsOutput: MetricsOutput = {
    version: 1,
    trade_date: ctx.trade_date ?? new Date().toISOString().slice(0, 10),
    computed_at: new Date().toISOString(),
    source_sql_run_ids: sourceIds,
    groups,
  };

  // Save metrics.json to data/ subfolder
  const metricsJson = JSON.stringify(metricsOutput, null, 2);
  const metricsBlobPath = buildRunArtifactPath(root, RUN_SUBFOLDERS.reports, "metrics.json");
  await uploadBlob(metricsBlobPath, metricsJson, "application/json");

  return {
    status: "computed",
    metrics_file: metricsBlobPath,
    metrics_count: groups.reduce((sum, g) => sum + g.values.length, 0),
    groups_count: groups.length,
  };
};

const handleBuildContext: StepHandler = async (runId, userEmail) => {
  const ctx = await getRunContext(runId);

  // Gather SQL results for context
  const sqlRuns = await query<{ sql_run_id: number; dialect: string; sql_text: string; result_json: string }>(
    `SELECT sql_run_id, dialect, sql_text, result_json FROM helioscta_agents.sql_runs
     WHERE run_id = $1 AND status = 'completed' ORDER BY created_at`,
    [runId]
  );

  // Load prompt.md from workspace
  let promptContent = "";
  const promptInput = await query<{ file_path: string }>(
    `SELECT file_path FROM helioscta_agents.analysis_pack_inputs
     WHERE pack_id = $1 AND input_type = 'prompt' LIMIT 1`,
    [ctx.pack_id]
  );
  if (promptInput.rows.length > 0) {
    const promptFile = await query<{ blob_path: string }>(
      `SELECT blob_path FROM helioscta_agents.workspace_files
       WHERE workspace_id = $1 AND blob_path LIKE $2 AND is_active = TRUE LIMIT 1`,
      [ctx.workspace_id, `%${promptInput.rows[0].file_path}`]
    );
    if (promptFile.rows.length > 0) {
      const buf = await downloadBlob(promptFile.rows[0].blob_path);
      promptContent = buf.toString("utf-8");
    }
  }

  // Load config/map.json
  let configContent = "";
  const configInput = await query<{ file_path: string }>(
    `SELECT file_path FROM helioscta_agents.analysis_pack_inputs
     WHERE pack_id = $1 AND input_type = 'config' LIMIT 1`,
    [ctx.pack_id]
  );
  if (configInput.rows.length > 0) {
    const configFile = await query<{ blob_path: string }>(
      `SELECT blob_path FROM helioscta_agents.workspace_files
       WHERE workspace_id = $1 AND blob_path LIKE $2 AND is_active = TRUE LIMIT 1`,
      [ctx.workspace_id, `%${configInput.rows[0].file_path}`]
    );
    if (configFile.rows.length > 0) {
      const buf = await downloadBlob(configFile.rows[0].blob_path);
      configContent = buf.toString("utf-8");
    }
  }

  // Load metrics.json if available
  const { root } = getRunPaths(ctx);
  let metricsContent = "";
  try {
    const metricsBlobPath = buildRunArtifactPath(root, RUN_SUBFOLDERS.reports, "metrics.json");
    const metricsBuf = await downloadBlob(metricsBlobPath);
    metricsContent = metricsBuf.toString("utf-8");
  } catch {
    // metrics.json may not exist if compute_metrics was skipped
  }

  // Build context for the agent
  const sqlContext = sqlRuns.rows.map((sr) => {
    const parsed = typeof sr.result_json === "string" ? JSON.parse(sr.result_json) : sr.result_json;
    return `<sql_result id="${sr.sql_run_id}" dialect="${sr.dialect}">\n${JSON.stringify(parsed?.rows?.slice(0, 50) ?? [], null, 2)}\n</sql_result>`;
  }).join("\n\n");

  // Save context as a structured markdown file for agent consumption
  const contextInput = [
    "# Analysis Context",
    "",
    "## Prompt",
    promptContent || "(no prompt file found)",
    "",
    "## Configuration",
    configContent ? `\`\`\`json\n${configContent}\n\`\`\`` : "(no config file found)",
    "",
    "## Computed Metrics",
    metricsContent ? `\`\`\`json\n${metricsContent}\n\`\`\`` : "(no computed metrics)",
    "",
    "## SQL Results",
    sqlContext || "(no SQL results yet)",
    "",
    "## Instructions",
    "Based on the prompt, configuration, metrics, and SQL results above, produce a structured JSON report.",
    `Trade date: ${ctx.trade_date ?? "not specified"}`,
    `Run ID: ${runId}`,
    `Pack slug: ${ctx.pack_slug}`,
    "",
    "The output must conform to the StructuredReport schema with typed sections:",
    "- narrative: markdown text analysis",
    "- metric_card: KPI cards with value, delta, trend",
    "- table: typed data tables",
    "- chart: Recharts-compatible chart configurations",
    "- signal: directional trading signals with confidence",
  ].join("\n");

  // Save context to context/ subfolder
  const contextFileName = "analysis_draft.md";
  const contextBlobPath = buildRunArtifactPath(root, RUN_SUBFOLDERS.drafts, contextFileName);
  const parentPath = `/${RUN_SUBFOLDERS.drafts}/`;
  await uploadBlob(contextBlobPath, contextInput, "text/markdown");

  await query(
    `INSERT INTO helioscta_agents.workspace_files
       (workspace_id, file_name, blob_path, file_type, mime_type, size_bytes, parent_path, source, created_by)
     VALUES ($1, $2, $3, 'md', 'text/markdown', $4, $5, 'orchestrator', $6)
     ON CONFLICT (blob_path) DO UPDATE SET size_bytes = EXCLUDED.size_bytes, updated_at = NOW(), is_active = TRUE`,
    [ctx.workspace_id, contextFileName, contextBlobPath, Buffer.byteLength(contextInput), parentPath, userEmail]
  );

  return {
    status: "context_prepared",
    context_file: contextBlobPath,
    sql_results_count: sqlRuns.rows.length,
    has_metrics: !!metricsContent,
    message: "Context saved. Ready for report generation.",
  };
};

const handleGenerateReport: StepHandler = async (runId) => {
  const ctx = await getRunContext(runId);
  const { root } = getRunPaths(ctx);

  // Read context from context/analysis_draft.md — try new path first, then legacy
  const contextBlobPath = buildRunArtifactPath(root, RUN_SUBFOLDERS.drafts, "analysis_draft.md");
  let contextContent = "";
  try {
    const buf = await downloadBlob(contextBlobPath);
    contextContent = buf.toString("utf-8");
  } catch {
    // Fallback: try legacy drafts path
    try {
      const legacyPath = `${root}/drafts/analysis_draft.md`;
      const buf = await downloadBlob(legacyPath);
      contextContent = buf.toString("utf-8");
    } catch {
      return { status: "skipped", message: "No context document found to generate report from" };
    }
  }

  // Read metrics.json if available
  let metricsData: MetricsOutput | null = null;
  try {
    const metricsBlobPath = buildRunArtifactPath(root, RUN_SUBFOLDERS.reports, "metrics.json");
    const metricsBuf = await downloadBlob(metricsBlobPath);
    metricsData = JSON.parse(metricsBuf.toString("utf-8"));
  } catch {
    // metrics may not exist
  }

  // Build a structured report from context + metrics
  // This creates a baseline structured report from available data.
  // In production, this would call Claude API for richer narrative generation.
  const sections: StructuredReport["sections"] = [];
  const sqlRunIds = metricsData?.source_sql_run_ids ?? [];

  // Extract narrative sections from context markdown
  const mdSections = contextContent.split(/^## /m).slice(1);
  for (const sec of mdSections) {
    const heading = sec.split("\n")[0].trim();
    // Skip internal context sections
    if (["Prompt", "Configuration", "Computed Metrics", "Instructions"].includes(heading)) continue;
    const body = sec.slice(heading.length).trim();
    if (body.length > 0) {
      sections.push({
        type: "narrative",
        section_key: heading.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        heading,
        markdown: body,
        evidence_sql_run_ids: sqlRunIds,
      });
    }
  }

  // Add metric card sections from metrics.json
  if (metricsData && metricsData.groups.length > 0) {
    for (const group of metricsData.groups) {
      sections.push({
        type: "metric_card",
        section_key: group.group_key,
        heading: group.label,
        evidence_sql_run_ids: sqlRunIds,
        metrics: group.values.map((v) => ({
          label: v.label,
          value: v.current != null ? String(v.current) : "N/A",
          value_numeric: v.current ?? undefined,
          unit: v.unit,
          delta: v.delta != null ? `${v.delta >= 0 ? "+" : ""}${v.delta}` : undefined,
          delta_numeric: v.delta ?? undefined,
          trend: v.delta != null ? (v.delta > 0 ? "up" as const : v.delta < 0 ? "down" as const : "flat" as const) : undefined,
        })),
      });
    }
  }

  const report: StructuredReport = {
    version: 1,
    pack_slug: ctx.pack_slug as string,
    trade_date: ctx.trade_date ?? new Date().toISOString().slice(0, 10),
    generated_at: new Date().toISOString(),
    run_id: runId,
    title: `${(ctx.pack_slug as string).replace(/_/g, " ")} — ${ctx.trade_date ?? "Today"}`,
    summary: sections.length > 0
      ? `Report with ${sections.length} section(s) generated from ${sqlRunIds.length} SQL run(s).`
      : "No reportable content found in context.",
    overall_signal: "neutral",
    sections,
  };

  // Save report.json to data/ subfolder
  const reportJson = JSON.stringify(report, null, 2);
  const reportBlobPath = buildRunArtifactPath(root, RUN_SUBFOLDERS.reports, "report.json");
  await uploadBlob(reportBlobPath, reportJson, "application/json");

  // Register as workspace file
  await query(
    `INSERT INTO helioscta_agents.workspace_files
       (workspace_id, file_name, blob_path, file_type, mime_type, size_bytes, parent_path, source, created_by)
     VALUES ($1, $2, $3, 'json', 'application/json', $4, $5, 'orchestrator', 'system')
     ON CONFLICT (blob_path) DO UPDATE SET size_bytes = EXCLUDED.size_bytes, updated_at = NOW(), is_active = TRUE`,
    [ctx.workspace_id, "report.json", reportBlobPath, Buffer.byteLength(reportJson), `/${RUN_SUBFOLDERS.reports}/`]
  );

  // Record as artifact
  await query(
    `INSERT INTO helioscta_agents.report_artifacts (run_id, artifact_type, blob_path, generated_by)
     VALUES ($1, 'json', $2, 'orchestrator')`,
    [runId, reportBlobPath]
  );

  return { status: "generated", report_path: reportBlobPath, sections_count: sections.length };
};

const handleEvidenceLink: StepHandler = async (runId) => {
  const ctx = await getRunContext(runId);
  const { root } = getRunPaths(ctx);

  // Try to read report.json (structured) first
  const reportBlobPath = buildRunArtifactPath(root, RUN_SUBFOLDERS.reports, "report.json");
  let reportData: StructuredReport | null = null;
  try {
    const buf = await downloadBlob(reportBlobPath);
    reportData = JSON.parse(buf.toString("utf-8"));
  } catch {
    // No structured report — try legacy context/draft
  }

  // Get all SQL runs for this run
  const sqlRuns = await query<{ sql_run_id: number }>(
    `SELECT sql_run_id FROM helioscta_agents.sql_runs WHERE run_id = $1 AND status = 'completed' ORDER BY created_at`,
    [runId]
  );

  if (sqlRuns.rows.length === 0) {
    return { status: "skipped", message: "No SQL runs to link" };
  }

  let linksCreated = 0;
  const evidenceLinks: Array<{
    section_key: string;
    heading: string;
    claim_text: string;
    sql_run_ids: number[];
  }> = [];

  if (reportData && reportData.sections) {
    // Use structured report sections with their embedded evidence_sql_run_ids
    for (const section of reportData.sections) {
      const sectionSqlIds = section.evidence_sql_run_ids?.length
        ? section.evidence_sql_run_ids
        : sqlRuns.rows.map((r) => r.sql_run_id);

      let claimText = "";
      if (section.type === "narrative") claimText = section.markdown.slice(0, 200);
      else if (section.type === "signal") claimText = section.signals.map((s) => s.label).join("; ");
      else claimText = section.heading;

      for (const sqlRunId of sectionSqlIds) {
        await query(
          `INSERT INTO helioscta_agents.evidence_links (run_id, section_key, claim_text, sql_run_id)
           VALUES ($1, $2, $3, $4)`,
          [runId, section.section_key, claimText.slice(0, 200), sqlRunId]
        );
        linksCreated++;
      }

      evidenceLinks.push({
        section_key: section.section_key,
        heading: section.heading,
        claim_text: claimText.slice(0, 200),
        sql_run_ids: sectionSqlIds,
      });
    }
  } else {
    // Fallback: legacy markdown-based evidence linking
    const contextBlobPath = buildRunArtifactPath(root, RUN_SUBFOLDERS.drafts, "analysis_draft.md");
    let markdown = "";
    try {
      const buf = await downloadBlob(contextBlobPath);
      markdown = buf.toString("utf-8");
    } catch {
      try {
        const legacyPath = `${root}/drafts/analysis_draft.md`;
        const buf = await downloadBlob(legacyPath);
        markdown = buf.toString("utf-8");
      } catch {
        return { status: "skipped", message: "No report or draft found to link" };
      }
    }

    const sections = markdown.split(/^## /m).slice(1);
    for (const section of sections) {
      const sectionKey = section.split("\n")[0].trim();
      const sectionContent = section.slice(sectionKey.length).trim();
      const allSqlIds = sqlRuns.rows.map((r) => r.sql_run_id);

      for (const sqlRunId of allSqlIds) {
        await query(
          `INSERT INTO helioscta_agents.evidence_links (run_id, section_key, claim_text, sql_run_id)
           VALUES ($1, $2, $3, $4)`,
          [runId, sectionKey, sectionContent.slice(0, 200), sqlRunId]
        );
        linksCreated++;
      }

      evidenceLinks.push({
        section_key: sectionKey,
        heading: sectionKey,
        claim_text: sectionContent.slice(0, 200),
        sql_run_ids: allSqlIds,
      });
    }
  }

  // Save evidence.json to evidence/ subfolder
  const evidenceJson = JSON.stringify(evidenceLinks, null, 2);
  const evidenceBlobPath = buildRunArtifactPath(root, RUN_SUBFOLDERS.evidence, "evidence.json");
  await uploadBlob(evidenceBlobPath, evidenceJson, "application/json");

  return {
    status: "linked",
    sections_found: evidenceLinks.length,
    links_created: linksCreated,
    evidence_file: evidenceBlobPath,
  };
};

const STEP_HANDLERS: Record<StepName, StepHandler> = {
  load_inputs: handleLoadInputs,
  execute_sql: handleExecuteSql,
  compute_metrics: handleComputeMetrics,
  build_context: handleBuildContext,
  generate_report: handleGenerateReport,
  evidence_link: handleEvidenceLink,
};
