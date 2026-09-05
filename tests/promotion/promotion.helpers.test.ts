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

  it("accepts safe defaults and the explicit additional-rule contract", () => {
    expect(additionalRulesSchema.safeParse({}).success).toBe(true);
    expect(
      additionalRulesSchema.safeParse({
        schema_version: 1,
        require_complete_result: true,
        success_outcome: "PROMOTED_WITH_SUPPORT",
        failure_outcome: "REPEAT_RECOMMENDED",
        incomplete_outcome: "ACADEMIC_REVIEW",
      }).success,
    ).toBe(true);
    expect(
      additionalRulesSchema.safeParse({
        schema_version: 1,
        allow_manual_review: true,
      }).success,
    ).toBe(false);
    expect(additionalRulesSchema.safeParse({ schema_version: 2 }).success).toBe(
      false,
    );
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

  it("rejects wrong outcome types and missing explicit fields", () => {
    expect(
      additionalRulesSchema.safeParse({
        schema_version: 1,
        require_complete_result: true,
        success_outcome: "ACADEMIC_REVIEW",
        failure_outcome: "ACADEMIC_REVIEW",
        incomplete_outcome: "ACADEMIC_REVIEW",
      }).success,
    ).toBe(false);
    expect(
      additionalRulesSchema.safeParse({
        schema_version: 1,
        require_complete_result: true,
        success_outcome: "PROMOTED",
        failure_outcome: "ACADEMIC_REVIEW",
      }).success,
    ).toBe(false);
  });

  it("rejects non-object additional rules", () => {
    expect(additionalRulesSchema.safeParse([]).success).toBe(false);
    expect(additionalRulesSchema.safeParse(null).success).toBe(false);
  });

  it("accepts complete required-subject semantics", () => {
    expect(
      requiredSubjectRulesSchema.safeParse({
        schema_version: 1,
        subjects: [
          {
            subject_id: "00000000-0000-4000-8000-000000000001",
            require: "COMPLETE",
          },
        ],
      }).success,
    ).toBe(true);
  });
});
