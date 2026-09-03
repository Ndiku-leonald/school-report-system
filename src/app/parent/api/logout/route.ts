import { NextResponse } from "next/server";

import { revokeParentSession } from "@/lib/parent-portal/server";
import { PARENT_SESSION_COOKIE } from "@/lib/parent-portal/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ message: "Request rejected." }, { status: 403 });
  }
  await revokeParentSession();
  const response = NextResponse.redirect(
    new URL("/parent/login", request.url),
    303,
  );
  response.cookies.set(PARENT_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/parent",
    maxAge: 0,
    expires: new Date(0),
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function GET() {
  return NextResponse.json(
    { message: "Method not allowed." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
