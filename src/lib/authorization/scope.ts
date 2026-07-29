import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import type { AuthorizationContext } from "./context";
import { AuthorizationError } from "./guards";

export function requireActiveSchool(context: AuthorizationContext) {
  if (!context.activeSchoolId) {
    throw new AuthorizationError();
  }

  return context.activeSchoolId;
}

export function assertSameSchool(
  context: AuthorizationContext,
  targetSchoolId: string,
) {
  if (context.activeSchoolId !== targetSchoolId) {
    throw new AuthorizationError();
  }
}

export async function requireAssignedClass(
  context: AuthorizationContext,
  termId: string,
  classSectionId: string,
) {
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);
  const [term, assignment] = await Promise.all([
    supabase
      .from("terms")
      .select("starts_on, ends_on")
      .eq("id", termId)
      .lte("starts_on", today)
      .gte("ends_on", today)
      .maybeSingle(),
    supabase
      .from("class_teacher_assignments")
      .select("id")
      .eq("staff_membership_id", context.activeMembershipId)
      .eq("term_id", termId)
      .eq("class_section_id", classSectionId)
      .eq("is_active", true)
      .lte("starts_on", today)
      .or(`ends_on.is.null,ends_on.gte.${today}`)
      .maybeSingle(),
  ]);

  if (term.error || !term.data || assignment.error || !assignment.data) {
    throw new AuthorizationError();
  }
}

export async function requireAssignedSubject(
  context: AuthorizationContext,
  termId: string,
  classSectionId: string,
  subjectId: string,
) {
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);
  const [term, assignment] = await Promise.all([
    supabase
      .from("terms")
      .select("starts_on, ends_on")
      .eq("id", termId)
      .lte("starts_on", today)
      .gte("ends_on", today)
      .maybeSingle(),
    supabase
      .from("teaching_assignments")
      .select("id")
      .eq("staff_membership_id", context.activeMembershipId)
      .eq("term_id", termId)
      .eq("class_section_id", classSectionId)
      .eq("subject_id", subjectId)
      .eq("is_active", true)
      .lte("starts_on", today)
      .or(`ends_on.is.null,ends_on.gte.${today}`)
      .maybeSingle(),
  ]);

  if (term.error || !term.data || assignment.error || !assignment.data) {
    throw new AuthorizationError();
  }
}
