function envBool(key: string, fallback = false): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val === "true" || val === "1";
}

/** Feature flags set via NEXT_PUBLIC_* env vars; defaults are true. */
export const GENSCAPE_ENABLED = envBool("NEXT_PUBLIC_GENSCAPE_ENABLED", true);
export const ICE_CASH_ENABLED = envBool("NEXT_PUBLIC_ICE_CASH_ENABLED", true);
