import "server-only";

import { requireActiveStaff } from "@/lib/auth/access";
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
  const { data, error } = await supabase.rpc("get_my_effective_permissions", {
    target_membership_id: staff.activeMembership.id,
  });

  if (error) {
    console.error("Authorization context query failed.", {
      resource: "effective-permissions",
    });
    throw new Error("The authorization context could not be loaded.");
  }

  return {
    userId: staff.user.id,
    activeMembershipId: staff.activeMembership.id,
    activeSchoolId: staff.activeMembership.school_id,
    activeRoles: staff.activeMembership.roles.map(({ role }) => role),
    permissions: new Set(data ?? []),
    staff,
  };
}
