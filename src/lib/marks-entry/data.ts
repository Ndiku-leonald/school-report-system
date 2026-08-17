import "server-only";

import { notFound } from "next/navigation";
import { z } from "zod";

import { requireAnyPermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import type {
  MarkCell,
  MarkComponent,
  MarkEntryGrid,
  MarkRosterItem,
  MyMarkSheet,
} from "./types";

const componentSchema = z.object({
  componentId: z.string().uuid(),
  componentCode: z.string(),
  name: z.string(),
  maximumScore: z.coerce.number(),
  weightPercentage: z.coerce.number(),
  isRequired: z.boolean(),
  sortOrder: z.number().int(),
});
const rosterSchema = z.object({
  enrollmentId: z.string().uuid(),
  studentId: z.string().uuid(),
  admissionNumber: z.string(),
  displayName: z.string(),
  classNumber: z.string().nullable(),
  enrollmentStatus: z.string(),
});
const cellSchema = z.object({
  markId: z.string().uuid(),
  componentId: z.string().uuid(),
  enrollmentId: z.string().uuid(),
  score: z.coerce.number().nullable(),
  attendanceStatus: z.enum(["PRESENT", "ABSENT", "EXEMPTED", "NOT_ASSESSED"]),
  teacherRemark: z.string().nullable(),
  rowVersion: z.number().int().positive(),
  updatedAt: z.string(),
});

async function marksReader() {
  return requireAnyPermission([
    "MARKS_VIEW_ALL",
    "MARKS_VIEW_ASSIGNED",
    "MARKS_ENTER",
  ]);
}

export async function getMyMarkSheets(): Promise<MyMarkSheet[]> {
  await requireAnyPermission(["MARKS_VIEW_ASSIGNED", "MARKS_ENTER"]);
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("list_my_mark_sheets");
  if (result.error) {
    console.error("Assigned mark sheets query failed.", {
      code: result.error.code,
    });
    throw new Error("Your marks workspace could not be loaded.");
  }
  return (result.data ?? []) as MyMarkSheet[];
}

export async function getSchoolMarkSheets() {
  await requireAnyPermission(["MARKS_VIEW_ALL"]);
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("list_mark_sheets");
  if (result.error) {
    console.error("School mark sheets query failed.", {
      code: result.error.code,
    });
    throw new Error("The marks overview could not be loaded.");
  }
  return result.data ?? [];
}

export async function getMarkSheetEditor(markSheetId: string) {
  await marksReader();
  const supabase = await createServerSupabaseClient();
  const [detailsResult, gridResult] = await Promise.all([
    supabase.rpc("get_mark_sheet", { target_mark_sheet_id: markSheetId }),
    supabase.rpc("get_mark_entry_grid", { target_mark_sheet_id: markSheetId }),
  ]);
  if (detailsResult.error || gridResult.error) {
    console.error("Mark sheet editor query failed.", {
      resources: [detailsResult.error?.code, gridResult.error?.code].filter(
        Boolean,
      ),
    });
    throw new Error("The mark sheet could not be loaded.");
  }
  const details = detailsResult.data?.[0];
  const rawGrid = gridResult.data?.[0];
  if (!details || !rawGrid) notFound();
  const grid: MarkEntryGrid = {
    components: z
      .array(componentSchema)
      .parse(rawGrid.components) as MarkComponent[],
    roster: z.array(rosterSchema).parse(rawGrid.roster) as MarkRosterItem[],
    marks: z.array(cellSchema).parse(rawGrid.mark_entries) as MarkCell[],
  };
  return { details, grid };
}
