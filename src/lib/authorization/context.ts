import "server-only";

import { redirect } from "next/navigation";

import { requireActiveStaff } from "@/lib/auth/access";
import { getSessionActiveMembership } from "@/lib/auth/session-membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

import type { AppPermission } from "./permissions";

type StaffRole = Database["public"]["Enums"]["staff_role"];

export type AuthorizationContext = {
  userId: string;
  activeMembershipId: string;
  activeSchoolId: string;
  activeRoles: readonly StaffRole[];
  permissions: ReadonlySet<AppPermission>;
  staff: Awaited<ReturnType<typeof requireActiveStaff>>;
};

export async function getAuthorizationContext(): Promise<AuthorizationContext> {
  const staff = await requireActiveStaff();
  const supabase = await createServerSupabaseClient();
  const selectedMembershipId = await getSessionActiveMembership(supabase);

  if (
    !selectedMembershipId ||
    selectedMembershipId !== staff.activeMembership.id
  ) {
    console.error("Authorization membership selections do not match.");
    redirect("/auth-error");
  }

  const { data, error } = await supabase.rpc("get_my_effective_permissions", {
    target_membership_id: selectedMembershipId,
  });

  if (error) {
    console.error("Authorization context query failed.", {
      resource: "effective-permissions",
    });
    throw new Error("The authorization context could not be loaded.");
  }

  return {
    userId: staff.user.id,
    activeMembershipId: selectedMembershipId,
    activeSchoolId: staff.activeMembership.school_id,
    activeRoles: staff.activeMembership.roles.map(({ role }) => role),
    permissions: new Set(data ?? []),
    staff,
  };
}
