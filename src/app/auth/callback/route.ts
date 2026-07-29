import { NextResponse, type NextRequest } from "next/server";

import { sanitizeNextPath } from "@/lib/auth/safe-redirect";
import {
  recoveryStateMatchesUserEmail,
  setRecoveryProofCookie,
  verifyPasswordRecoveryState,
} from "@/lib/auth/recovery";
import { getPublicEnvironment } from "@/lib/env/public";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const applicationUrl = getPublicEnvironment().NEXT_PUBLIC_APP_URL;
  const code = request.nextUrl.searchParams.get("code");
  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
  const recoveryStateValue = request.nextUrl.searchParams.get("recovery_state");
  const recoveryState = recoveryStateValue
    ? verifyPasswordRecoveryState(recoveryStateValue)
    : null;

  if (
    !code ||
    (recoveryStateValue && !recoveryState) ||
    (!recoveryState && next !== "/complete-invitation")
  ) {
    return NextResponse.redirect(new URL("/auth-error", applicationUrl));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/auth-error", applicationUrl));
  }

  if (!recoveryState) {
    return NextResponse.redirect(
      new URL("/complete-invitation", applicationUrl),
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (
    userError ||
    !user?.email ||
    !recoveryStateMatchesUserEmail(user.email, recoveryState.emailHash)
  ) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/auth-error", applicationUrl));
  }

  const response = NextResponse.redirect(
    new URL("/reset-password", applicationUrl),
  );
  setRecoveryProofCookie(response.cookies, user.id);
  return response;
}
