import { z } from "zod";

const id = z.uuid("Select a valid record.");
const timestamp = z.iso.datetime({ offset: true });
const date = z.iso.date("Enter a valid date.");
const optionalDate = z
  .union([z.literal(""), date, z.null()])
  .transform((value) => value || null);
const reason = z.string().trim().min(3, "Enter a meaningful reason.").max(500);

const periodSchema = z
  .object({ startsOn: date, endsOn: optionalDate })
  .refine((value) => !value.endsOn || value.endsOn >= value.startsOn, {
    path: ["endsOn"],
    message: "The end date cannot be before the start date.",
  });

export const teachingAssignmentSchema = periodSchema.and(
  z.object({
    termId: id,
    classSectionId: id,
    subjectId: id,
    staffMembershipId: id,
  }),
);

export const classTeacherAssignmentSchema = periodSchema.and(
  z.object({
    termId: id,
    classSectionId: id,
    staffMembershipId: id,
    isPrimary: z.boolean(),
  }),
);

export const assignmentUpdateSchema = periodSchema.and(
  z.object({ assignmentId: id, expectedUpdatedAt: timestamp }),
);

export const assignmentEndSchema = z.object({
  assignmentId: id,
  expectedUpdatedAt: timestamp,
  endsOn: date,
  reason,
});

export const primaryReplacementSchema = z.object({
  termId: id,
  classSectionId: id,
  staffMembershipId: id,
  startsOn: date,
  reason,
});

export const assignmentScopeSchema = z
  .object({
    termId: id,
    classSectionId: id,
    subjectId: id.optional(),
    startsOn: date,
    endsOn: optionalDate,
    isPrimary: z.boolean().default(false),
  })
  .refine((value) => !value.endsOn || value.endsOn >= value.startsOn, {
    path: ["endsOn"],
    message: "The end date cannot be before the start date.",
  });

const optionalFilterId = id.optional().catch(undefined);

export const assignmentFiltersSchema = z.object({
  view: z.enum(["subject", "class"]).optional().catch(undefined),
  year: optionalFilterId,
  term: optionalFilterId,
  grade: optionalFilterId,
  class: optionalFilterId,
  subject: optionalFilterId,
  teacher: optionalFilterId,
  designation: z.enum(["primary", "assistant"]).optional().catch(undefined),
  period: z
    .enum(["CURRENT", "UPCOMING", "ENDED", "INACTIVE"])
    .optional()
    .catch(undefined),
  page: z.string().regex(/^\d+$/).optional().catch(undefined),
});

export type TeachingAssignmentInput = z.input<typeof teachingAssignmentSchema>;
export type ClassTeacherAssignmentInput = z.input<
  typeof classTeacherAssignmentSchema
>;
