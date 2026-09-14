import { z } from "zod";

export const requiredSubjectRuleSchema = z.object({
  subject_id: z.uuid(),
  require: z.enum(["PASS", "COMPLETE"]),
});

export const requiredSubjectRulesSchema = z.union([
  z
    .object({
      schema_version: z.literal(1),
      subjects: z.array(requiredSubjectRuleSchema),
    })
    .strict(),
  z.object({}).strict(),
]);

export const additionalRulesSchema = z.union([
  z
    .object({
      schema_version: z.literal(1),
      require_complete_result: z.boolean(),
      success_outcome: z.enum(["PROMOTED", "PROMOTED_WITH_SUPPORT"]),
      failure_outcome: z.enum(["ACADEMIC_REVIEW", "REPEAT_RECOMMENDED"]),
      incomplete_outcome: z.enum(["ACADEMIC_REVIEW", "REPEAT_RECOMMENDED"]),
    })
    .strict(),
  z.object({}).strict(),
]);

export const promotionOutcomeSchema = z.enum([
  "PROMOTED",
  "PROMOTED_WITH_SUPPORT",
  "ACADEMIC_REVIEW",
  "REPEAT_CONFIRMED",
  "COMPLETED",
]);

export const overrideReasonSchema = z.string().trim().min(3).max(2000);
