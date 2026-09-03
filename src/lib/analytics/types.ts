export type AnalyticsReadinessState =
  | "CURRENT"
  | "NO_RUN"
  | "STALE_RUN"
  | "TERM_NOT_LOCKED"
  | "MISSING_SOURCE"
  | "UNLOCKED_SOURCE";

export type AnalyticsScope = {
  academic_year_id: string;
  academic_year_name: string;
  term_id: string;
  term_name: string;
  term_status: string;
  grade_level_id: string;
  grade_name: string;
  current_run_id: string | null;
  calculation_version: number | null;
  run_created_at: string | null;
  input_checksum: string | null;
  output_checksum: string | null;
  analytics_population: number;
  expected_source_scopes: number;
  current_locked_source_scopes: number;
  readiness_state: AnalyticsReadinessState;
};

export type AnalyticsCoverage = {
  grade_level_id: string;
  grade_name: string;
  run_id: string | null;
  state: AnalyticsReadinessState;
  source_student_population: number;
};

export type SchoolAnalyticsSummary = {
  term_id: string;
  term_name: string;
  academic_year_name: string;
  eligible_grade_count: number;
  current_grade_count: number;
  excluded_grade_count: number;
  analytics_population: number;
  source_student_population: number;
  complete_count: number;
  incomplete_count: number;
  average_population_count: number;
  mean_overall_average: number | null;
  ranking_eligible_count: number;
  graded_count: number;
  aggregate_classified_count: number;
  coverage: AnalyticsCoverage[];
};

export type GradeAnalyticsSummary = {
  run_id: string;
  term_id: string;
  term_name: string;
  academic_year_name: string;
  grade_level_id: string;
  grade_name: string;
  calculation_version: number;
  input_checksum: string;
  output_checksum: string;
  analytics_population: number;
  complete_count: number;
  incomplete_count: number;
  average_population_count: number;
  mean_overall_average: number | null;
  ranking_eligible_count: number;
  graded_count: number;
  aggregate_classified_count: number;
  class_count: number;
};

export type ClassAnalyticsSummary = {
  class_section_id: string;
  class_name: string;
  analytics_population: number;
  complete_count: number;
  incomplete_count: number;
  average_population_count: number;
  mean_overall_average: number | null;
  ranking_eligible_count: number;
  graded_count: number;
  aggregate_classified_count: number;
};

export type AnalyticsDistributionRow = {
  distribution_type: "OVERALL_GRADE" | "AGGREGATE_CLASSIFICATION";
  label: string | null;
  row_count: number;
  percentage: number | null;
  sort_order: number | null;
  distribution_population: number;
  ungraded_count: number;
  unclassified_count: number;
  classification_scale_present: boolean;
};

export type AnalyticsSubjectPerformance = {
  class_section_id: string | null;
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

export type AnalyticsTopStudent = {
  enrollment_id: string;
  admission_number: string;
  student_name: string;
  class_section_id: string;
  class_name: string;
  overall_average: number | null;
  overall_grade: string | null;
  position: number;
  tie_size: number;
  is_tied: boolean;
};

export type AnalyticsAttentionStudent = {
  enrollment_id: string;
  admission_number: string;
  student_name: string;
  class_section_id: string;
  class_name: string;
  overall_average: number | null;
  overall_grade: string | null;
  is_complete: boolean;
  failed_subject_count: number;
  incomplete_subject_count: number;
  attention_reason: string;
};

export type AnalyticsStudentDetail = {
  enrollment_id: string;
  admission_number: string;
  student_name: string;
  class_name: string;
  term_name: string;
  grade_name: string;
  academic_year_name: string;
  calculation_version: number;
  overall_total: number | null;
  overall_average: number | null;
  overall_grade: string | null;
  aggregate_total: number | null;
  aggregate_classification: string | null;
  class_position: number | null;
  grade_level_position: number | null;
  class_tie_size: number;
  grade_level_tie_size: number;
  class_is_tied: boolean;
  grade_level_is_tied: boolean;
  is_complete: boolean;
  ranking_eligible: boolean;
};

export type AnalyticsStudentSubject = {
  subject_id: string;
  subject_name: string;
  subject_status: "COMPLETE" | "INCOMPLETE" | "EXEMPTED";
  subject_score: number | null;
  grade: string | null;
  aggregate_points: number | null;
  is_pass: boolean | null;
  subject_position: number | null;
  subject_tie_size: number;
  subject_is_tied: boolean;
  has_absence: boolean;
  has_exemption: boolean;
};
