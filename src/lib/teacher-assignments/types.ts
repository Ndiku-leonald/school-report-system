import type { Database } from "@/types/database.generated";

type Functions = Database["public"]["Functions"];

export type TeachingAssignmentRow =
  Functions["list_teaching_assignments"]["Returns"][number];
export type ClassTeacherAssignmentRow =
  Functions["list_class_teacher_assignments"]["Returns"][number];
export type EligibleSubjectTeacher =
  Functions["list_eligible_subject_teachers"]["Returns"][number];
export type EligibleClassTeacher =
  Functions["list_eligible_class_teachers"]["Returns"][number];
export type MyTeacherAssignment =
  Functions["get_my_teacher_assignments"]["Returns"][number];

export type AssignmentFilters = {
  view?: "subject" | "class";
  year?: string;
  term?: string;
  grade?: string;
  class?: string;
  subject?: string;
  teacher?: string;
  designation?: "primary" | "assistant";
  period?: "CURRENT" | "UPCOMING" | "ENDED" | "INACTIVE";
  page?: string;
};

export type AssignmentScopeSelection = {
  term?: string;
  class?: string;
  subject?: string;
  starts?: string;
  ends?: string;
  primary?: string;
};
