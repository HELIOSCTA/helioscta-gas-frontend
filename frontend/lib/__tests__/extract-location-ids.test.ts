import { describe, it, expect } from "vitest";
import {
  extractLocationIds,
  ExtractionError,
} from "../extract-location-ids";

describe("extractLocationIds", () => {
  it("extracts locationIds from a flat array of objects", () => {
    const input = JSON.stringify([
      { locationId: 442494, locationName: "A" },
      { locationId: 442454, locationName: "B" },
      { locationId: 442496, locationName: "C" },
    ]);
    const result = extractLocationIds(input);
    expect(result.locationIds).toEqual([442494, 442454, 442496]);
    expect(result.count).toBe(3);
  });

  it("deduplicates IDs while preserving insertion order", () => {
    const input = JSON.stringify([
      { locationId: 100 },
      { locationId: 200 },
      { locationId: 100 },
      { locationId: 300 },
      { locationId: 200 },
    ]);
    const result = extractLocationIds(input);
    expect(result.locationIds).toEqual([100, 200, 300]);
    expect(result.count).toBe(3);
  });

  it("extracts from nested objects", () => {
    const input = JSON.stringify({
      data: {
        items: [{ locationId: 1 }, { locationId: 2 }],
        meta: { locationId: 3 },
      },
    });
    const result = extractLocationIds(input);
    expect(result.locationIds).toEqual([1, 2, 3]);
  });

  it("handles string locationId values", () => {
    const input = JSON.stringify([
      { locationId: "442494" },
      { locationId: "442454" },
    ]);
    const result = extractLocationIds(input);
    expect(result.locationIds).toEqual([442494, 442454]);
  });

  it("handles the krs-cig-watchlist.yaml sample data", () => {
    const input = JSON.stringify([
      { pipelineShortName: "CIG", locationId: 442494, facility: "THROUGHPUT METER" },
      { pipelineShortName: "CIG", locationId: 442454, facility: "THROUGHPUT METER" },
      { pipelineShortName: "CIG", locationId: 442496, facility: "THROUGHPUT METER" },
      { pipelineShortName: "CIG", locationId: 442500, facility: "THROUGHPUT METER" },
      { pipelineShortName: "CIG", locationId: 442373, facility: "THROUGHPUT METER" },
    ]);
    const result = extractLocationIds(input);
    expect(result.locationIds).toEqual([442494, 442454, 442496, 442500, 442373]);
    expect(result.count).toBe(5);
  });

  it("throws ExtractionError for empty input", () => {
    expect(() => extractLocationIds("")).toThrow(ExtractionError);
    expect(() => extractLocationIds("   ")).toThrow(ExtractionError);
    expect(() => extractLocationIds("")).toThrow(/No data provided/);
  });

  it("throws ExtractionError for malformed JSON", () => {
    expect(() => extractLocationIds("{not valid json")).toThrow(ExtractionError);
    expect(() => extractLocationIds("[{locationId: 1}]")).toThrow(/Invalid JSON/);
  });

  it("throws ExtractionError when no locationId fields found", () => {
    const input = JSON.stringify([{ id: 1 }, { name: "test" }]);
    expect(() => extractLocationIds(input)).toThrow(ExtractionError);
    expect(() => extractLocationIds(input)).toThrow(/No locationId values found/);
  });

  it("ignores non-integer locationId values", () => {
    const input = JSON.stringify([
      { locationId: 100 },
      { locationId: 3.14 },
      { locationId: NaN },
      { locationId: null },
      { locationId: true },
      { locationId: 200 },
    ]);
    const result = extractLocationIds(input);
    expect(result.locationIds).toEqual([100, 200]);
  });

  it("handles a single object (not array)", () => {
    const input = JSON.stringify({ locationId: 42 });
    const result = extractLocationIds(input);
    expect(result.locationIds).toEqual([42]);
  });
});
