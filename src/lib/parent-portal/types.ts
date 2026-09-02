export const PARENT_SESSION_COOKIE = "parent-report-session";
export const PARENT_SESSION_TTL_SECONDS = 2 * 60 * 60;
export const PARENT_IDLE_TTL_SECONDS = 30 * 60;

export type ParentSession = {
  session_id: string;
  credential_id: string;
  student_id: string;
  school_id: string;
};

export type ParentReportListItem = {
  report_id: string;
  report_version: number;
  student_name: string;
  admission_number: string;
  academic_year_label: string;
  term_label: string;
  grade_label: string;
  class_label: string;
  published_at: string;
  is_current: boolean;
  status: "PUBLISHED" | "SUPERSEDED";
};

export type ParentReportDetail = {
  report_id: string;
  status: "PUBLISHED" | "SUPERSEDED";
  report_version: number;
  published_at: string;
  is_current: boolean;
  parent_data: Record<string, unknown>;
};

export type ParentArtifactDescriptor = {
  report_id: string;
  student_id: string;
  session_id: string;
  credential_id: string;
  school_id: string;
  report_version: number;
  status: "PUBLISHED" | "SUPERSEDED";
  published_at: string;
  storage_path: string;
  file_checksum: string;
  file_size: number;
  student_name: string;
  academic_year_label: string;
  term_label: string;
};

export type IssuedParentCredential = {
  credential_id: string;
  student_id: string;
  access_code: string;
  pin: string;
  operation: "ISSUED" | "ROTATED";
  expires_at: string | null;
};
