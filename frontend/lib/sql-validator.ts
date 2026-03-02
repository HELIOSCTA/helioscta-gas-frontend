export interface SqlValidationResult {
  valid: boolean;
  errors: string[];
}

/** Strip SQL comments (-- line and /* block *​/) */
function stripComments(sql: string): string {
  // Remove block comments
  let cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove line comments
  cleaned = cleaned.replace(/--.*$/gm, "");
  return cleaned;
}

const FORBIDDEN_PATTERNS: { pattern: RegExp; label: string }[] = [
  // DDL
  { pattern: /\b(CREATE)\b/i, label: "CREATE" },
  { pattern: /\b(ALTER)\b/i, label: "ALTER" },
  { pattern: /\b(DROP)\b/i, label: "DROP" },
  { pattern: /\b(TRUNCATE)\b/i, label: "TRUNCATE" },
  // DML mutations
  { pattern: /\b(INSERT)\b/i, label: "INSERT" },
  { pattern: /\b(UPDATE)\b/i, label: "UPDATE" },
  { pattern: /\b(DELETE)\b/i, label: "DELETE" },
  { pattern: /\b(MERGE)\b/i, label: "MERGE" },
  // Stored procs / exec
  { pattern: /\b(EXEC|EXECUTE|CALL)\b/i, label: "EXEC/EXECUTE/CALL" },
  { pattern: /\b(xp_|sp_)\w+/i, label: "xp_/sp_ system procedure" },
  // DCL
  { pattern: /\b(GRANT)\b/i, label: "GRANT" },
  { pattern: /\b(REVOKE)\b/i, label: "REVOKE" },
  { pattern: /\b(DENY)\b/i, label: "DENY" },
  // SELECT INTO (creates a table)
  { pattern: /\bSELECT\b[^;]*\bINTO\b/i, label: "SELECT INTO" },
];

/**
 * Validate that SQL is read-only (SELECT/WITH only).
 * Returns { valid: true } or { valid: false, errors: [...] }.
 */
export function validateReadOnlySql(sqlText: string): SqlValidationResult {
  const errors: string[] = [];

  if (!sqlText.trim()) {
    return { valid: false, errors: ["SQL text is empty"] };
  }

  const cleaned = stripComments(sqlText);

  // Check for multi-statement (semicolons splitting into 2+ non-empty statements)
  const statements = cleaned
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (statements.length > 1) {
    errors.push("Multi-statement SQL is not allowed (found semicolons splitting into multiple statements)");
  }

  // Scan for forbidden keywords
  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (pattern.test(cleaned)) {
      errors.push(`Forbidden keyword detected: ${label}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
