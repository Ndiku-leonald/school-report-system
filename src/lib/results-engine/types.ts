export type ResultActionResult =
  | {
      ok: true;
      message: string;
      runId?: string;
      version?: number;
      reused?: boolean;
    }
  | { ok: false; message: string; code?: string; conflict?: boolean };

export type ResultCalculationTerm = {
  term_id: string;
  academic_year_id: string;
  academic_year_name: string;
  term_name: string;
  term_status: string;
  grade_level_id: string;
  grade_name: string;
  latest_run_id: string | null;
  latest_version: number | null;
  input_checksum: string | null;
  created_at: string | null;
};

export type ResultCalculationOption = {
  option_type: "GRADING_SCALE" | "RANKING_RULE" | "CLASSIFICATION_SCALE";
  option_id: string;
  option_name: string;
  option_version: number;
  ranking_basis: "TOTAL" | "AVERAGE" | "AGGREGATE" | "CONFIGURED" | null;
  tie_method: "DENSE" | "COMPETITION" | "ORDINAL" | "SHARED" | null;
};

export type ResultCalculationRun = {
  run_id: string;
  term_id: string;
  term_name: string;
  academic_year_id: string;
  academic_year_name: string;
  grade_level_id: string;
  grade_name: string;
  version: number;
  supersedes_run_id: string | null;
  grading_scale_id: string;
  grading_scale_name: string;
  grading_scale_version: number;
  ranking_rule_id: string;
  ranking_rule_name: string;
  ranking_rule_version: number;
  classification_scale_id: string | null;
  classification_scale_name: string | null;
  classification_scale_version: number | null;
  input_checksum: string;
  output_checksum: string;
  created_at: string;
  source_sheet_count: number;
  student_count: number;
};

export type CalculatedStudent = {
  enrollment_id: string;
  admission_number: string;
  student_name: string;
  class_section_id: string;
  class_name: string;
  subject_count: number;
  complete_subject_count: number;
  subjects_passed: number;
  overall_total: number | null;
  overall_average: number | null;
  overall_grade: string | null;
  aggregate_total: number | null;
  aggregate_classification: string | null;
  is_complete: boolean;
  ranking_eligible: boolean;
  ranking_metric: number | null;
  class_position: number | null;
  grade_level_position: number | null;
  class_tie_size: number;
  grade_level_tie_size: number;
  class_is_tied: boolean;
  grade_level_is_tied: boolean;
};

export type CalculatedStudentDetail = Omit<
  CalculatedStudent,
  | "class_section_id"
  | "class_name"
  | "subject_count"
  | "complete_subject_count"
  | "subjects_passed"
  | "ranking_metric"
  | "class_tie_size"
  | "grade_level_tie_size"
  | "class_is_tied"
  | "grade_level_is_tied"
> & {
  class_name: string;
  term_name: string;
  grade_name: string;
  calculation_version: number;
};

export type CalculatedSubject = {
  subject_id: string;
  subject_name: string;
  subject_score: number | null;
  grade: string | null;
  aggregate_points: number | null;
  is_pass: boolean | null;
  subject_status: "COMPLETE" | "INCOMPLETE" | "EXEMPTED";
  assessed_weight: number;
  has_absence: boolean;
  has_exemption: boolean;
  subject_position: number | null;
  subject_tie_size: number;
  subject_is_tied: boolean;
};

export type ResultComponentExplanation = {
  subject_id: string;
  subject_name: string;
  component_name: string;
  attendance_status: "PRESENT" | "ABSENT" | "EXEMPTED" | "NOT_ASSESSED" | null;
  entered_score: number | null;
  maximum_score: number;
  weight_percentage: number;
  included_weight: number;
  weighted_contribution: number;
};

export type SubjectPerformance = {
  class_section_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  mean_score: number | null;
  minimum_score: number | null;
  maximum_score: number | null;
  pass_rate: number | null;
  complete_count: number;
  incomplete_count: number;
  exempted_count: number;
  grade_distribution: Record<string, number>;
};

export type AggregateClassificationBand = {
  id: string;
  minimumAggregate: number;
  maximumAggregate: number;
  label: string;
  description: string | null;
  sortOrder: number;
};

export type AggregateClassificationScale = {
  id: string;
  academic_year_id: string | null;
  grade_level_id: string | null;
  name: string;
  version: number;
  is_active: boolean;
  retired_at: string | null;
  updated_at: string;
  bands: AggregateClassificationBand[];
};
