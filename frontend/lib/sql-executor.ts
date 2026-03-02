import { query } from "@/lib/db";
import { mssqlQuery } from "@/lib/mssql";
import { validateReadOnlySql } from "@/lib/sql-validator";

export interface SqlExecutionResult {
  status: "success" | "error" | "validation_error";
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  truncated: boolean;
  elapsedMs: number;
  error?: string;
}

interface ExecuteSqlOptions {
  dialect: "postgresql" | "mssql";
  sqlText: string;
  maxRows?: number;
  timeoutMs?: number;
}

const DEFAULT_MAX_ROWS = 5000;

/**
 * Execute read-only SQL against PostgreSQL or Azure SQL.
 * Validates first, then runs with a row limit to detect truncation.
 */
export async function executeSql({
  dialect,
  sqlText,
  maxRows = DEFAULT_MAX_ROWS,
}: ExecuteSqlOptions): Promise<SqlExecutionResult> {
  // Validate read-only
  const validation = validateReadOnlySql(sqlText);
  if (!validation.valid) {
    return {
      status: "validation_error",
      rows: [],
      columns: [],
      rowCount: 0,
      truncated: false,
      elapsedMs: 0,
      error: validation.errors.join("; "),
    };
  }

  const fetchLimit = maxRows + 1; // fetch one extra to detect truncation
  const start = Date.now();

  try {
    let rows: Record<string, unknown>[];

    if (dialect === "postgresql") {
      // Wrap in a subquery with LIMIT to enforce row cap
      const limitedSql = `SELECT * FROM (${sqlText.replace(/;\s*$/, "")}) AS _q LIMIT ${fetchLimit}`;
      const result = await query(limitedSql);
      rows = result.rows as Record<string, unknown>[];
    } else {
      // mssql: wrap with TOP
      const trimmed = sqlText.replace(/;\s*$/, "");
      // Azure SQL forbids ORDER BY inside a subquery unless TOP/OFFSET is present.
      // Strip trailing ORDER BY from inner query and apply it on the outer wrapper.
      const orderByMatch = trimmed.match(/\bORDER\s+BY\s+[\s\S]+$/i);
      const inner = orderByMatch ? trimmed.slice(0, orderByMatch.index).trimEnd() : trimmed;
      const orderBy = orderByMatch ? ` ${orderByMatch[0]}` : "";
      const limitedSql = `SELECT TOP ${fetchLimit} * FROM (${inner}) AS _q${orderBy}`;
      rows = await mssqlQuery(limitedSql);
    }

    const elapsedMs = Date.now() - start;
    const truncated = rows.length > maxRows;
    if (truncated) rows = rows.slice(0, maxRows);

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return {
      status: "success",
      rows,
      columns,
      rowCount: rows.length,
      truncated,
      elapsedMs,
    };
  } catch (err) {
    const elapsedMs = Date.now() - start;
    return {
      status: "error",
      rows: [],
      columns: [],
      rowCount: 0,
      truncated: false,
      elapsedMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
