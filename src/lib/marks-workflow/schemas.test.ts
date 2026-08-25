import { describe, expect, it } from "vitest";

import {
  correctionRevisionSchema,
  markSheetReturnSchema,
  marksReviewFiltersSchema,
} from "./schemas";

const transition = {
  markSheetId: "11111111-1111-4111-8111-111111111111",
  expectedUpdatedAt: "2026-08-17T20:00:00Z",
};

describe("marks-workflow schemas", () => {
  it("normalizes a return reason", () => {
    expect(
      markSheetReturnSchema.parse({
        ...transition,
        reason: "  Recheck score  ",
      }).reason,
    ).toBe("Recheck score");
  });

  it("rejects empty and control-character reasons", () => {
    expect(
      markSheetReturnSchema.safeParse({ ...transition, reason: "" }).success,
    ).toBe(false);
    expect(
      markSheetReturnSchema.safeParse({
        ...transition,
        reason: "Bad\u0000reason",
      }).success,
    ).toBe(false);
  });

  it("requires correction source concurrency", () => {
    expect(
      correctionRevisionSchema.safeParse({
        sourceMarkSheetId: transition.markSheetId,
        expectedSourceUpdatedAt: "not-a-time",
        reason: "Correction requested",
      }).success,
    ).toBe(false);
  });

  it("drops malformed review filters", () => {
    expect(
      marksReviewFiltersSchema.parse({
        term: "not-a-uuid",
        status: "UNKNOWN",
        page: "-2",
      }),
    ).toEqual({ term: undefined, status: undefined, page: undefined });
  });
});
