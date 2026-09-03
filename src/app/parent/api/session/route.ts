import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getParentClientKey,
  verifyParentLogin,
} from "@/lib/parent-portal/server";
import {
  PARENT_SESSION_COOKIE,
  PARENT_SESSION_TTL_SECONDS,
} from "@/lib/parent-portal/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z
  .object({
    accessCode: z.string().trim().min(1).max(35),
    pin: z.string().regex(/^\d{8}$/),
  })
  .strict();

function response(message: string, status: number, retryAfter = 0) {
  const result = NextResponse.json({ ok: false, message }, { status });
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("X-Content-Type-Options", "nosniff");
  if (retryAfter > 0) result.headers.set("Retry-After", String(retryAfter));
  return result;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2048)
    return response("The details could not be verified.", 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response("The details could not be verified.", 400);
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success)
    return response("The details could not be verified.", 400);

  const result = await verifyParentLogin(
    parsed.data.accessCode,
    parsed.data.pin,
    await getParentClientKey(),
  );
  if (!result.ok) {
    return response(
      "The details could not be verified. Check the access code and PIN or try again later.",
      result.retryAfterSeconds > 0 ? 429 : 401,
      result.retryAfterSeconds,
    );
  }

  const success = NextResponse.json({ ok: true });
  success.cookies.set(PARENT_SESSION_COOKIE, result.token ?? "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/parent",
    maxAge: PARENT_SESSION_TTL_SECONDS,
  });
  success.headers.set("Cache-Control", "private, no-store");
  success.headers.set("X-Content-Type-Options", "nosniff");
  return success;
}
