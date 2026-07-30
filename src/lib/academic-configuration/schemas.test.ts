import { describe, expect, it } from "vitest";

import {
  academicYearSchema,
  assessmentSchemeSchema,
  gradingScaleSchema,
  promotionRuleSchema,
} from "./schemas";

describe("academic configuration schemas", () => {
  it("requires an academic year to end after it starts", () => {
    expect(
      academicYearSchema.safeParse({
        name: "2030",
        startsOn: "2030-12-31",
        endsOn: "2030-01-01",
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate assessment component codes", () => {
    expect(
      assessmentSchemeSchema.safeParse({
        termId: "00000000-0000-4000-8000-000000000001",
        gradeLevelId: "00000000-0000-4000-8000-000000000002",
        subjectId: "00000000-0000-4000-8000-000000000003",
        name: "Course work",
        effectiveFrom: "2030-01-01",
        components: [
          {
            name: "First",
            componentCode: "CW",
            maximumScore: 100,
            weightPercentage: 50,
            sortOrder: 1,
          },
          {
            name: "Second",
            componentCode: "CW",
            maximumScore: 100,
            weightPercentage: 50,
            sortOrder: 2,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps grading bands inside the supported score range", () => {
    expect(
      gradingScaleSchema.safeParse({
        academicYearId: "",
        gradeLevelId: "",
        name: "Standard",
        effectiveFrom: "2030-01-01",
        bands: [
          {
            minimumScore: 0,
            maximumScore: 101,
            grade: "A",
            aggregatePoints: 1,
            sortOrder: 1,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts bounded promotion thresholds and JSON objects", () => {
    expect(
      promotionRuleSchema.safeParse({
        academicYearId: "",
        gradeLevelId: "",
        name: "Progression",
        minimumAverage: 50,
        maximumAggregate: 30,
        minimumSubjectsPassed: 5,
        minimumAttendancePercentage: 80,
        requiredSubjectRules: {},
        additionalRules: {},
      }).success,
    ).toBe(true);
  });
});
