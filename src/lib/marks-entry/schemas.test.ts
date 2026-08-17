import { describe, expect, it } from "vitest";

import { markEntryBatchSchema, markEntrySchema } from "./schemas";

const base = {
  assessmentComponentId: "11111111-1111-4111-8111-111111111111",
  enrollmentId: "22222222-2222-4222-8222-222222222222",
  expectedRowVersion: null,
  score: 0,
  attendanceStatus: "PRESENT" as const,
  teacherRemark: null,
};

describe("marks-entry schemas", () => {
  it("preserves a genuine zero score for a present learner", () => {
    expect(markEntrySchema.parse(base).score).toBe(0);
  });

  it("rejects a present learner without a score", () => {
    expect(markEntrySchema.safeParse({ ...base, score: null }).success).toBe(
      false,
    );
  });

  it("rejects a score for an absent learner", () => {
    expect(
      markEntrySchema.safeParse({ ...base, attendanceStatus: "ABSENT" })
        .success,
    ).toBe(false);
  });

  it("limits a batch to 500 unique application entries", () => {
    expect(
      markEntryBatchSchema.safeParse({
        markSheetId: "33333333-3333-4333-8333-333333333333",
        entries: Array.from({ length: 501 }, () => base),
      }).success,
    ).toBe(false);
  });

  it("rejects control characters in remarks", () => {
    expect(
      markEntrySchema.safeParse({ ...base, teacherRemark: "bad\u0000remark" })
        .success,
    ).toBe(false);
  });
});
