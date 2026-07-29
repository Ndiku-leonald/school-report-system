export type MembershipAccess =
  | "/account-unavailable"
  | "/complete-invitation"
  | "/select-school"
  | "/staff-login"
  | "active";

export function resolveMembershipAccess({
  activeCount,
  hasSelectedActiveMembership,
  hasSession,
  invitedCount,
}: {
  activeCount: number;
  hasSelectedActiveMembership: boolean;
  hasSession: boolean;
  invitedCount: number;
}): MembershipAccess {
  if (!hasSession) return "/staff-login";
  if (hasSelectedActiveMembership || activeCount === 1) return "active";
  if (activeCount > 1) return "/select-school";
  if (invitedCount > 0) return "/complete-invitation";
  return "/account-unavailable";
}
