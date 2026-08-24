import { describe, expect, it } from "vitest";

import {
  aggregateClassificationSchema,
  calculateResultsSchema,
} from "./schemas";

const id = "00000000-0000-0000-0000-000000000001";

describe("results engine schemas", () => {
  it("requires explicit calculation rules", () => {
    expect(
      calculateResultsSchema.safeParse({
        termId: id,
        gradeLevelId: id,
        classificationScaleId: "",
      }).success,
    ).toBe(false);
  });

  it("rejects overlapping classification ranges", () => {
    const result = aggregateClassificationSchema.safeParse({
      academicYearId: "",
      gradeLevelId: "",
      name: "Configured divisions",
      bands: [
        {
          minimumAggregate: 4,
          maximumAggregate: 8,
          label: "A",
          description: "",
          sortOrder: 1,
        },
        {
          minimumAggregate: 8,
          maximumAggregate: 12,
          label: "B",
          description: "",
          sortOrder: 2,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
