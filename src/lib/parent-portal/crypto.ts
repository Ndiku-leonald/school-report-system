import "server-only";

import { createHash, createHmac } from "node:crypto";

import { getParentPortalEnvironment } from "@/lib/env/parent-portal";

export function normalizeParentAccessCode(value: string) {
  return value.trim().replace(/[\s-]/g, "").toUpperCase();
}

export function hashParentAccessCode(value: string) {
  return createHash("sha256")
    .update(normalizeParentAccessCode(value), "utf8")
    .digest("hex");
}

export function hashParentSessionToken(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashParentClientKey(value: string) {
  return createHmac(
    "sha256",
    getParentPortalEnvironment().PARENT_ACCESS_RATE_LIMIT_SECRET,
  )
    .update(value, "utf8")
    .digest("hex");
}
