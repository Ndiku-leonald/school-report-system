import "server-only";

import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { ACTIVE_SCHOOL_COOKIE } from "@/lib/auth/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Membership =
  Database["public"]["Tables"]["school_staff_memberships"]["Row"];
type RoleAssignment =
  Database["public"]["Tables"]["staff_role_assignments"]["Row"];
type School = Database["public"]["Tables"]["schools"]["Row"];

export type StaffMembershipContext = Membership & {
  roles: RoleAssignment[];
  school: School;
};

export type StaffContext = {
  user: User;
  profile: Profile | null;
  memberships: StaffMembershipContext[];
  activeMembership: StaffMembershipContext | null;
};

function requireSuccessfulQuery(
  error: { message: string } | null,
  resource: string,
) {
  if (error) {
    console.error("Staff context query failed.", { resource });
    throw new Error("The staff account context could not be loaded.");
  }
}

export async function getStaffContext(): Promise<StaffContext | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const [profileResult, membershipResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("school_staff_memberships")
      .select("*")
      .eq("profile_id", user.id)
      .order("created_at"),
  ]);

  requireSuccessfulQuery(profileResult.error, "profile");
  requireSuccessfulQuery(membershipResult.error, "memberships");

  const memberships = membershipResult.data ?? [];
  const membershipIds = memberships.map(({ id }) => id);
  const schoolIds = [...new Set(memberships.map(({ school_id }) => school_id))];

  const [roleResult, schoolResult] = await Promise.all([
    membershipIds.length
      ? supabase
          .from("staff_role_assignments")
          .select("*")
          .in("membership_id", membershipIds)
          .is("revoked_at", null)
      : Promise.resolve({ data: [] as RoleAssignment[], error: null }),
    schoolIds.length
      ? supabase.from("schools").select("*").in("id", schoolIds)
      : Promise.resolve({ data: [] as School[], error: null }),
  ]);

  requireSuccessfulQuery(roleResult.error, "roles");
  requireSuccessfulQuery(schoolResult.error, "schools");

  const roles = roleResult.data ?? [];
  const schools = new Map(
    (schoolResult.data ?? []).map((school) => [school.id, school]),
  );

  const membershipContexts = memberships.flatMap((membership) => {
    const school = schools.get(membership.school_id);

    if (!school) {
      return [];
    }

    return [
      {
        ...membership,
        school,
        roles: roles.filter(
          (assignment) => assignment.membership_id === membership.id,
        ),
      },
    ];
  });

  const cookieStore = await cookies();
  const selectedMembershipId = cookieStore.get(ACTIVE_SCHOOL_COOKIE)?.value;
  const activeMemberships = membershipContexts.filter(
    (membership) =>
      membership.status === "ACTIVE" && membership.school.is_active,
  );
  const activeMembership =
    activeMemberships.find(
      (membership) => membership.id === selectedMembershipId,
    ) ??
    (activeMemberships.length === 1 ? activeMemberships[0] : null) ??
    null;

  return {
    user,
    profile: profileResult.data,
    memberships: membershipContexts,
    activeMembership,
  };
}

export function getActiveMemberships(context: StaffContext) {
  return context.memberships.filter(
    (membership) =>
      membership.status === "ACTIVE" && membership.school.is_active,
  );
}

export function getInvitedMemberships(context: StaffContext) {
  return context.memberships.filter(
    (membership) =>
      membership.status === "INVITED" && membership.school.is_active,
  );
}
