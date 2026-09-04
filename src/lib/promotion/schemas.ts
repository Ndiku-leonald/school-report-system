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
      require_all_required_subjects: z.boolean().optional(),
      allow_manual_review: z.boolean().optional(),
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
