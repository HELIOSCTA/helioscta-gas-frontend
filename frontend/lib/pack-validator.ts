/**
 * Convention validator for analysis pack folder structure.
 * Warning-only — never blocks execution.
 */

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

/**
 * Validate that a pack's files follow the standard convention.
 * @param packSlug - The pack identifier
 * @param files - Array of relative file paths within the pack folder
 */
export function validatePackConvention(
  packSlug: string,
  files: string[]
): ValidationResult {
  const warnings: string[] = [];

  // Check for prompt.md
  if (!files.some((f) => f === "prompt.md")) {
    warnings.push(`[${packSlug}] Missing prompt.md — expected at root of pack folder`);
  }

  // Check for analysis/working.md
  if (!files.some((f) => f === "analysis/working.md")) {
    warnings.push(`[${packSlug}] Missing analysis/working.md — no working narrative file`);
  }

  // Check for any SQL in sql/core/
  const coreSql = files.filter((f) => f.startsWith("sql/core/") && f.endsWith(".sql"));
  if (coreSql.length === 0) {
    warnings.push(`[${packSlug}] No SQL files in sql/core/ — expected at least one core query`);
  }

  // Check for pack.md
  if (!files.some((f) => f === "pack.md")) {
    warnings.push(`[${packSlug}] Missing pack.md — no pack descriptor found`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}
