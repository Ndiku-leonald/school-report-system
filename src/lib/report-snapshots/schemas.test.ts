import { describe, expect, it } from "vitest";

import {
  reportSnapshotDataSchema,
  reportSnapshotGenerationSchema,
  snapshotSchemaVersion,
} from "./schemas";

const id = "00000000-0000-4000-8000-000000000001";

describe("report snapshot schemas", () => {
  it("accepts a valid generation request", () => {
    expect(
      reportSnapshotGenerationSchema.safeParse({ calculationRunId: id })
        .success,
    ).toBe(true);
  });

  it("rejects malformed generation ids", () => {
    expect(
      reportSnapshotGenerationSchema.safeParse({ calculationRunId: "run" })
        .success,
    ).toBe(false);
  });

  it("requires an explicit supported snapshot schema version", () => {
    const result = reportSnapshotDataSchema.safeParse({
      snapshot_schema_version: snapshotSchemaVersion + 1,
    });
    expect(result.success).toBe(false);
  });
});
