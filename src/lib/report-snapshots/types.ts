import type { z } from "zod";

import type { reportSnapshotDataSchema } from "./schemas";

export type ReportSnapshotData = z.infer<typeof reportSnapshotDataSchema>;

export type ReportActionResult =
  | {
      ok: true;
      message: string;
      batchId?: string;
      reportId?: string;
      generatedCount?: number;
      reusedCount?: number;
    }
  | { ok: false; message: string; code?: string };

export type ReportGenerationReadiness = {
  calculation_run_id: string;
  calculation_version: number;
  term_id: string;
  term_name: string;
  academic_year_name: string;
  grade_level_id: string;
  grade_name: string;
  student_population: number;
  eligible_student_count: number;
  existing_report_snapshots: number;
  missing_report_snapshots: number;
  latest_report_versions: Record<string, number>;
  result_input_checksum: string;
  result_output_checksum: string;
  ready: boolean;
};

export type GeneratedReportListItem = {
  report_id: string;
  enrollment_id: string;
  student_name: string;
  admission_number: string;
  academic_year_name: string;
  term_name: string;
  term_number: number;
  grade_name: string;
  class_name: string;
  calculation_run_id: string;
  calculation_version: number;
  report_version: number;
  status: string;
  created_at: string;
  snapshot_checksum: string;
  superseded_by: string | null;
  is_latest: boolean;
};

export type GeneratedReport = {
  report_id: string;
  enrollment_id: string;
  calculation_run_id: string;
  calculation_version: number;
  report_version: number;
  status: string;
  created_at: string;
  superseded_by: string | null;
  snapshot_id: string;
  snapshot_schema_version: number;
  snapshot_data: ReportSnapshotData;
  snapshot_checksum: string;
  input_checksum: string;
  output_checksum: string;
};

export type ReportSubjectSnapshot = {
  report_id: string;
  subject_id: string;
  subject_code: string | null;
  subject_name: string | null;
  subject_score: number | null;
  grade: string | null;
  aggregate_points: number | null;
  subject_position: number | null;
  subject_status: "COMPLETE" | "INCOMPLETE" | "EXEMPTED" | null;
  is_pass: boolean | null;
  assessed_weight: number | null;
  has_absence: boolean;
  has_exemption: boolean;
  subject_tie_size: number;
  subject_is_tied: boolean;
  teacher_comment: string | null;
  sort_order: number;
};

export type ReportHistoryItem = {
  report_id: string;
  calculation_run_id: string;
  calculation_version: number;
  report_version: number;
  generated_at: string | null;
  snapshot_checksum: string;
  superseded_by: string | null;
  status: string;
  is_latest: boolean;
};
