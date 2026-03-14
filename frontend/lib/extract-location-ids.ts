/**
 * Extracts and deduplicates locationId values from Genscape/WoodMac lasso output.
 * The lasso tool produces JSON (captured via DevTools Network tab) containing
 * objects with `locationId` fields.
 */

export interface ExtractionResult {
  locationIds: number[];
  count: number;
}

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

/** Recursively collect all `locationId` values from a parsed JSON structure. */
function collectLocationIds(data: unknown, ids: Set<number>): void {
  if (Array.isArray(data)) {
    for (const item of data) {
      collectLocationIds(item, ids);
    }
  } else if (data !== null && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if ("locationId" in obj) {
      const val = obj.locationId;
      if (typeof val === "number" && Number.isFinite(val) && Number.isInteger(val)) {
        ids.add(val);
      } else if (typeof val === "string") {
        const parsed = parseInt(val, 10);
        if (Number.isFinite(parsed) && Number.isInteger(parsed)) {
          ids.add(parsed);
        }
      }
    }
    for (const value of Object.values(obj)) {
      collectLocationIds(value, ids);
    }
  }
}

/**
 * Parses JSON text from Genscape/WoodMac lasso output and extracts all
 * `locationId` values, deduplicated in insertion order.
 *
 * @throws ExtractionError for empty input, malformed JSON, or zero IDs found
 */
export function extractLocationIds(input: string): ExtractionResult {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new ExtractionError(
      "No data provided. Paste the JSON output from the Genscape/WoodMac lasso tool."
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new ExtractionError(
      "Invalid JSON format. Ensure you've copied the complete response from DevTools."
    );
  }

  const ids = new Set<number>();
  collectLocationIds(parsed, ids);

  if (ids.size === 0) {
    throw new ExtractionError("No locationId values found in the provided data.");
  }

  const locationIds = Array.from(ids);
  return { locationIds, count: locationIds.length };
}
