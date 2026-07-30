import { NextResponse, type NextRequest } from "next/server";

import {
  ACTIVE_SCHOOL_COOKIE,
  ACTIVE_SCHOOL_COOKIE_OPTIONS,
} from "@/lib/auth/constants";
import {
  invitationStateMatchesUserEmail,
  verifyStaffInvitationState,
} from "@/lib/auth/invitation-state";
import {
  clearRecoveryProofCookie,
  recoveryStateMatchesUserEmail,
  setRecoveryProofCookie,
  verifyPasswordRecoveryState,
} from "@/lib/auth/recovery";
import { clearSessionActiveMembership } from "@/lib/auth/session-membership";
import { getPublicEnvironment } from "@/lib/env/public";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const applicationUrl = getPublicEnvironment().NEXT_PUBLIC_APP_URL;
  const code = request.nextUrl.searchParams.get("code");
  const recoveryStateValues =
    request.nextUrl.searchParams.getAll("recovery_state");
  const invitationStateValues =
    request.nextUrl.searchParams.getAll("invitation_state");
  const hasExactlyOneState =
    (recoveryStateValues.length === 1 && invitationStateValues.length === 0) ||
    (recoveryStateValues.length === 0 && invitationStateValues.length === 1);

  if (
    !code ||
    !hasExactlyOneState ||
    request.nextUrl.searchParams.has("next")
  ) {
    return NextResponse.redirect(new URL("/auth-error", applicationUrl));
  }

  const recoveryStateValue = recoveryStateValues[0];
  const invitationStateValue = invitationStateValues[0];
  const recoveryState = recoveryStateValue
    ? verifyPasswordRecoveryState(recoveryStateValue)
    : null;
  const invitationState = invitationStateValue
    ? verifyStaffInvitationState(invitationStateValue)
    : null;

  if (!recoveryState && !invitationState) {
    return NextResponse.redirect(new URL("/auth-error", applicationUrl));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/auth-error", applicationUrl));
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  const userEmail = user?.email;
  let isValidFlow =
    !userError &&
    Boolean(userEmail) &&
    Boolean(
      (recoveryState &&
        recoveryStateMatchesUserEmail(
          userEmail ?? "",
          recoveryState.emailHash,
        )) ||
      (invitationState &&
        invitationStateMatchesUserEmail(
          userEmail ?? "",
          invitationState.emailHash,
        )),
    );

  if (isValidFlow && invitationState && user) {
    const { data: invitedMemberships, error: membershipError } = await supabase
      .from("school_staff_memberships")
      .select("id")
      .eq("profile_id", user.id)
      .eq("status", "INVITED")
      .limit(1);
    isValidFlow = !membershipError && Boolean(invitedMemberships?.length);
  }

  if (!isValidFlow || !user) {
    await clearSessionActiveMembership(supabase);
    await supabase.auth.signOut();
    const response = NextResponse.redirect(
      new URL("/auth-error", applicationUrl),
    );
    clearRecoveryProofCookie(response.cookies);
    response.cookies.set(ACTIVE_SCHOOL_COOKIE, "", {
      ...ACTIVE_SCHOOL_COOKIE_OPTIONS,
      maxAge: 0,
    });
    return response;
  }

  if (invitationState) {
    return NextResponse.redirect(
      new URL("/complete-invitation", applicationUrl),
    );
  }

  const response = NextResponse.redirect(
    new URL("/reset-password", applicationUrl),
  );
  setRecoveryProofCookie(response.cookies, user.id);
  return response;
}
