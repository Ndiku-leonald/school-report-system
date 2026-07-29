import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { setRecoveryProofCookie } from "@/lib/auth/recovery";
import { getPublicEnvironment } from "@/lib/env/public";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const allowedTypes = new Set<EmailOtpType>(["invite", "recovery"]);

export async function GET(request: NextRequest) {
  const applicationUrl = getPublicEnvironment().NEXT_PUBLIC_APP_URL;
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type || !allowedTypes.has(type)) {
    return NextResponse.redirect(new URL("/auth-error", applicationUrl));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    return NextResponse.redirect(new URL("/auth-error", applicationUrl));
  }

  if (type === "invite") {
    return NextResponse.redirect(
      new URL("/complete-invitation", applicationUrl),
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.redirect(new URL("/auth-error", applicationUrl));
  }

  const response = NextResponse.redirect(
    new URL("/reset-password", applicationUrl),
  );
  setRecoveryProofCookie(response.cookies, user.id);
  return response;
}
