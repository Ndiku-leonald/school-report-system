import { NextResponse } from "next/server";

import { clearRecoveryProofCookie } from "@/lib/auth/recovery";
import { getPublicEnvironment } from "@/lib/env/public";

export function GET() {
  const response = NextResponse.redirect(
    new URL("/auth-error", getPublicEnvironment().NEXT_PUBLIC_APP_URL),
  );
  clearRecoveryProofCookie(response.cookies);
  return response;
}
