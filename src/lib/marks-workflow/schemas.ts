import { z } from "zod";

const id = z.uuid("Choose a valid record.");
const timestamp = z.iso.datetime({ offset: true });
const reason = z
  .string()
  .trim()
  .min(3, "Enter a meaningful reason.")
  .max(1000, "Keep the reason within 1000 characters.")
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), {
    message: "Reasons cannot contain control characters.",
  });

export const markSheetWorkflowTransitionSchema = z.object({
  markSheetId: id,
  expectedUpdatedAt: timestamp,
});

export const markSheetReturnSchema = markSheetWorkflowTransitionSchema.extend({
  reason,
});

export const termWorkflowTransitionSchema = z.object({
  termId: id,
  expectedUpdatedAt: timestamp,
});

export const termCorrectionSchema = termWorkflowTransitionSchema.extend({
  reason,
});

export const correctionRevisionSchema = z.object({
  sourceMarkSheetId: id,
  expectedSourceUpdatedAt: timestamp,
  reason,
});

const optionalId = id.optional().catch(undefined);

export const marksReviewFiltersSchema = z.object({
  year: optionalId,
  term: optionalId,
  grade: optionalId,
  class: optionalId,
  subject: optionalId,
  teacher: optionalId,
  status: z
    .enum([
      "DRAFT",
      "SUBMITTED",
      "UNDER_REVIEW",
      "RETURNED",
      "APPROVED",
      "LOCKED",
    ])
    .optional()
    .catch(undefined),
  page: z.string().regex(/^\d+$/).optional().catch(undefined),
});

export type MarksReviewFilters = z.infer<typeof marksReviewFiltersSchema>;
