import { describe, expect, it } from "vitest";

import {
  assignmentEndSchema,
  assignmentFiltersSchema,
  classTeacherAssignmentSchema,
  primaryReplacementSchema,
  teachingAssignmentSchema,
} from "./schemas";

const ids = {
  termId: "10000000-0000-4000-8000-000000000001",
  classSectionId: "20000000-0000-4000-8000-000000000001",
  subjectId: "30000000-0000-4000-8000-000000000001",
  staffMembershipId: "40000000-0000-4000-8000-000000000001",
};

describe("teacher-assignment schemas", () => {
  it("accepts an inclusive one-day subject assignment", () => {
    expect(
      teachingAssignmentSchema.parse({
        ...ids,
        startsOn: "2026-08-09",
        endsOn: "2026-08-09",
      }),
    ).toMatchObject({ endsOn: "2026-08-09" });
  });

  it("rejects an end before the start", () => {
    expect(
      classTeacherAssignmentSchema.safeParse({
        ...ids,
        isPrimary: true,
        startsOn: "2026-08-10",
        endsOn: "2026-08-09",
      }).success,
    ).toBe(false);
  });

  it("requires a reason when ending an assignment", () => {
    expect(
      assignmentEndSchema.safeParse({
        assignmentId: ids.termId,
        expectedUpdatedAt: "2026-08-09T00:00:00Z",
        endsOn: "2026-08-09",
        reason: "",
      }).success,
    ).toBe(false);
  });

  it("requires a replacement effective date", () => {
    expect(
      primaryReplacementSchema.safeParse({
        ...ids,
        startsOn: "",
        reason: "Staffing change",
      }).success,
    ).toBe(false);
  });

  it("drops malformed assignment filters before an RPC is called", () => {
    expect(
      assignmentFiltersSchema.parse({
        view: "unexpected",
        term: "not-a-uuid",
        period: "SOMEDAY",
        page: "-4",
      }),
    ).toEqual({
      view: undefined,
      term: undefined,
      period: undefined,
      page: undefined,
    });
  });

  it("keeps valid assignment filters", () => {
    expect(
      assignmentFiltersSchema.parse({
        view: "class",
        term: ids.termId,
        designation: "assistant",
        period: "CURRENT",
        page: "2",
      }),
    ).toMatchObject({
      view: "class",
      term: ids.termId,
      designation: "assistant",
      period: "CURRENT",
      page: "2",
    });
  });
});
