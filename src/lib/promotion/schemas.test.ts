import { describe, expect, it } from "vitest";

import { additionalRulesSchema, requiredSubjectRulesSchema } from "./schemas";

describe("promotion configuration schemas", () => {
  it("accepts the documented required-subject rules", () => {
    expect(requiredSubjectRulesSchema.safeParse({}).success).toBe(true);
    expect(
      requiredSubjectRulesSchema.safeParse({
        schema_version: 1,
        subjects: [
          {
            subject_id: "00000000-0000-4000-8000-000000000001",
            require: "PASS",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects unknown required-subject and additional-rule shapes", () => {
    expect(
      requiredSubjectRulesSchema.safeParse({ unexpected: true }).success,
    ).toBe(false);
    expect(
      additionalRulesSchema.safeParse({ schema_version: 1, unsupported: true })
        .success,
    ).toBe(false);
  });
});
