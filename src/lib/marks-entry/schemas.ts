import { z } from "zod";

export const markSheetIdSchema = z.string().uuid("Choose a valid mark sheet.");
export const teachingAssignmentIdSchema = z
  .string()
  .uuid("Choose a valid teaching assignment.");

export const markEntrySchema = z
  .object({
    assessmentComponentId: z.string().uuid(),
    enrollmentId: z.string().uuid(),
    expectedRowVersion: z.number().int().positive().nullable(),
    score: z.number().min(0).max(99999.99).nullable(),
    attendanceStatus: z.enum(["PRESENT", "ABSENT", "EXEMPTED", "NOT_ASSESSED"]),
    teacherRemark: z.string().trim().max(500).nullable(),
  })
  .superRefine((entry, context) => {
    if (entry.attendanceStatus === "PRESENT" && entry.score === null) {
      context.addIssue({
        code: "custom",
        path: ["score"],
        message: "Present learners require a score.",
      });
    }
    if (entry.attendanceStatus !== "PRESENT" && entry.score !== null) {
      context.addIssue({
        code: "custom",
        path: ["score"],
        message: "Only present learners may have a score.",
      });
    }
    if (
      entry.teacherRemark &&
      /[\u0000-\u001f\u007f]/u.test(entry.teacherRemark)
    ) {
      context.addIssue({
        code: "custom",
        path: ["teacherRemark"],
        message: "Remarks cannot contain control characters.",
      });
    }
  });

export const markEntryBatchSchema = z.object({
  markSheetId: markSheetIdSchema,
  entries: z
    .array(markEntrySchema)
    .min(1, "Change at least one mark before saving.")
    .max(500, "Save no more than 500 cells at once."),
});

export type MarkEntryInput = z.infer<typeof markEntrySchema>;
