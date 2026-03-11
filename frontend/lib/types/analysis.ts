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
