import "server-only";

import { cookies } from "next/headers";

import { hashParentSessionToken } from "./crypto";
import { PARENT_SESSION_COOKIE } from "./types";
import { getParentSession } from "./server";

export { PARENT_SESSION_COOKIE };

export async function readParentSessionCookie() {
  return (await cookies()).get(PARENT_SESSION_COOKIE)?.value ?? null;
}

export async function getValidatedParentSession() {
  return getParentSession();
}

export function parentSessionHash(rawToken: string) {
  return hashParentSessionToken(rawToken);
}
