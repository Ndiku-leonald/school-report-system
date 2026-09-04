import { describe, expect, it } from "vitest";

import {
  additionalRulesSchema,
  requiredSubjectRulesSchema,
} from "@/lib/promotion/schemas";
import {
  checksumPrefix,
  criterionStateLabel,
  promotionOutcomeLabel,
} from "@/lib/promotion/format";

describe("promotion rule and evidence helpers", () => {
  it("accepts only the documented required-subject schema", () => {
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
    expect(
      requiredSubjectRulesSchema.safeParse({ unexpected: true }).success,
    ).toBe(false);
  });

  it("accepts only supported additional-rule fields", () => {
    expect(
      additionalRulesSchema.safeParse({
        schema_version: 1,
        allow_manual_review: true,
      }).success,
    ).toBe(true);
    expect(
      additionalRulesSchema.safeParse({ schema_version: 1, unsupported: true })
        .success,
    ).toBe(false);
  });

  it("formats recommendations and evidence states safely", () => {
    expect(promotionOutcomeLabel("REPEAT_RECOMMENDED")).toBe(
      "REPEAT RECOMMENDED",
    );
    expect(promotionOutcomeLabel("REPEAT_CONFIRMED")).not.toBe(
      "REPEAT RECOMMENDED",
    );
    expect(criterionStateLabel("MET")).toBe("Met");
    expect(criterionStateLabel("NOT_MET")).toBe("Not met");
    expect(criterionStateLabel("anything")).toBe("Unavailable");
    expect(checksumPrefix("a".repeat(64))).toBe("aaaaaaaaaaaa…");
  });
});
