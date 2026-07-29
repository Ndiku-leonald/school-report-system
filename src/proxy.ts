import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getProxyRedirect } from "@/lib/auth/route-rules";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { isAuthenticated, response } = await refreshSupabaseSession(request);
  const { pathname, search } = request.nextUrl;

  const redirectPath = getProxyRedirect({ isAuthenticated, pathname, search });

  return redirectPath
    ? NextResponse.redirect(new URL(redirectPath, request.url))
    : response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
