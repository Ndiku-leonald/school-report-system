export type PromotionOutcome =
  | "PROMOTED"
  | "PROMOTED_WITH_SUPPORT"
  | "ACADEMIC_REVIEW"
  | "REPEAT_RECOMMENDED"
  | "REPEAT_CONFIRMED"
  | "COMPLETED";

export type PromotionScope = {
  academic_year_id: string;
  academic_year_name: string;
  term_id: string;
  term_name: string;
  is_promotion_term: boolean;
  grade_level_id: string;
  grade_name: string;
  grade_is_final: boolean;
  rule_id: string | null;
  rule_version: number | null;
  rule_name: string | null;
  current_run_id: string | null;
  calculation_version: number | null;
  readiness_state: string;
  learner_count: number;
  decision_count: number;
};

export type PromotionRecommendation = {
  enrollment_id: string;
  decision_id: string;
  decision_version: number;
  snapshot_id: string | null;
  system_recommendation: PromotionOutcome;
  final_decision: PromotionOutcome | null;
  reason: string | null;
  was_overridden: boolean;
  snapshot_checksum: string | null;
  snapshot_data: Record<string, unknown> | null;
  state: "RECOMMENDED" | "CONFIRMED" | "PROGRESSED";
  progression_id: string | null;
};

export type PromotionTargetClass = {
  academic_year_id: string;
  academic_year_name: string;
  grade_level_id: string;
  grade_name: string;
  class_section_id: string;
  class_name: string;
  capacity: number | null;
  occupied: number;
  is_available: boolean;
};
