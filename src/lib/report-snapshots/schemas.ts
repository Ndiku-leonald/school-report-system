import { z } from "zod";

const id = z.uuid("Select a valid record.");

export const reportSnapshotGenerationSchema = z.object({
  calculationRunId: id,
});

export const studentReportSnapshotSchema = z.object({
  reportId: id,
});

export const reportHistorySchema = z.object({
  enrollmentId: id,
  termId: id,
});

export const snapshotSchemaVersion = 1;

export const reportSnapshotDataSchema = z.object({
  snapshot_schema_version: z.literal(snapshotSchemaVersion),
  source: z.object({
    calculation_run_id: id,
    calculation_version: z.number().int().positive(),
    input_checksum: z.string().length(64),
    output_checksum: z.string().length(64),
  }),
  school: z.object({
    id,
    name: z.string(),
    school_code: z.string(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    timezone: z.string(),
    logo_storage_path: z.string().nullable(),
    motto: z.string().nullable(),
    website: z.string().nullable(),
  }),
  student: z.object({
    id,
    admission_number: z.string(),
    display_name: z.string(),
    gender: z.string().nullable(),
    date_of_birth: z.string().nullable(),
    photo_storage_path: z.string().nullable(),
  }),
  academic_period: z.object({
    academic_year_id: id,
    academic_year_name: z.string(),
    term_id: id,
    term_name: z.string(),
    term_number: z.number().int().positive(),
  }),
  placement: z.object({
    enrollment_id: id,
    enrollment_status: z.string(),
    class_section_id: id,
    class_name: z.string(),
    class_code: z.string(),
    grade_level_id: id,
    grade_code: z.string(),
    grade_name: z.string(),
  }),
  academic_summary: z.object({
    overall_total: z.number().nullable(),
    overall_average: z.number().nullable(),
    overall_grade: z.string().nullable(),
    aggregate_total: z.number().nullable(),
    aggregate_classification: z.string().nullable(),
    subject_count: z.number().int().nonnegative(),
    complete_subject_count: z.number().int().nonnegative(),
    subjects_passed: z.number().int().nonnegative(),
    is_complete: z.boolean(),
    ranking_eligible: z.boolean(),
    class_position: z.number().int().nullable(),
    grade_level_position: z.number().int().nullable(),
    class_tie_size: z.number().int().nonnegative(),
    grade_level_tie_size: z.number().int().nonnegative(),
    class_is_tied: z.boolean(),
    grade_level_is_tied: z.boolean(),
  }),
  attendance: z
    .object({
      days_open: z.number().int().nonnegative(),
      days_present: z.number().int().nonnegative(),
      days_absent: z.number().int().nonnegative(),
      times_late: z.number().int().nonnegative(),
    })
    .nullable(),
  comments: z
    .object({
      class_teacher_comment: z.string().nullable(),
      head_teacher_comment: z.string().nullable(),
      conduct_grade: z.string().nullable(),
    })
    .nullable(),
  signatories: z.object({
    class_teacher: z
      .object({ display_name: z.string(), role_context: z.string() })
      .nullable(),
    head_teacher: z
      .object({ display_name: z.string(), role_context: z.string() })
      .nullable(),
  }),
  next_term: z
    .object({
      term_id: id,
      term_name: z.string(),
      term_number: z.number().int().positive(),
      starts_on: z.string(),
    })
    .nullable(),
});

export type ReportSnapshotGenerationInput = z.infer<
  typeof reportSnapshotGenerationSchema
>;
