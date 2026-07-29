import "server-only";

import { redirect } from "next/navigation";

import {
  getActiveMemberships,
  getInvitedMemberships,
  getStaffContext,
  type StaffContext,
} from "@/lib/auth/staff-context";
import {
  resolveMembershipAccess,
  type MembershipAccess,
} from "@/lib/auth/membership-rules";

export function resolveStaffAccess(
  context: StaffContext | null,
): MembershipAccess {
  return resolveMembershipAccess({
    activeCount: context ? getActiveMemberships(context).length : 0,
    hasSelectedActiveMembership: Boolean(context?.activeMembership),
    hasSession: Boolean(context),
    invitedCount: context ? getInvitedMemberships(context).length : 0,
  });
}

export async function requireActiveStaff(): Promise<
  StaffContext & {
    activeMembership: NonNullable<StaffContext["activeMembership"]>;
  }
> {
  const context = await getStaffContext();
  const destination = resolveStaffAccess(context);

  if (destination !== "active" || !context?.activeMembership) {
    redirect(destination);
  }

  return {
    ...context,
    activeMembership: context.activeMembership,
  };
}

export async function requireAuthenticatedStaff() {
  const context = await getStaffContext();

  if (!context) {
    redirect("/staff-login");
  }

  return context;
}
