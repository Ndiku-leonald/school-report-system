import type { Database, Json } from "@/types/database.generated";

type Functions = Database["public"]["Functions"];

export type MyMarkSheet = Omit<
  Functions["list_my_mark_sheets"]["Returns"][number],
  "mark_sheet_id" | "workflow_status" | "sheet_version" | "updated_at"
> & {
  mark_sheet_id: string | null;
  workflow_status: Database["public"]["Enums"]["mark_sheet_status"] | null;
  sheet_version: number | null;
  updated_at: string | null;
};

export type SchoolMarkSheet = Functions["list_mark_sheets"]["Returns"][number];
export type MarkSheetDetails = Functions["get_mark_sheet"]["Returns"][number];
export type MarkEntrySaveResult =
  Functions["save_mark_entries"]["Returns"][number];

export type MarkComponent = {
  componentId: string;
  componentCode: string;
  name: string;
  maximumScore: number;
  weightPercentage: number;
  isRequired: boolean;
  sortOrder: number;
};

export type MarkRosterItem = {
  enrollmentId: string;
  studentId: string;
  admissionNumber: string;
  displayName: string;
  classNumber: string | null;
  enrollmentStatus: string;
};

export type MarkCell = {
  markId: string;
  componentId: string;
  enrollmentId: string;
  score: number | null;
  attendanceStatus: Database["public"]["Enums"]["assessment_attendance_status"];
  teacherRemark: string | null;
  rowVersion: number;
  updatedAt: string;
};

export type MarkEntryGrid = {
  components: MarkComponent[];
  roster: MarkRosterItem[];
  marks: MarkCell[];
};

export function isJsonArray(value: Json): value is Json[] {
  return Array.isArray(value);
}
