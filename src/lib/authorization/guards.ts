import "server-only";

import { redirect } from "next/navigation";

import {
  hasAnyPermission,
  hasPermission,
  type AppPermission,
} from "./permissions";
import { getAuthorizationContext, type AuthorizationContext } from "./context";

export class AuthorizationError extends Error {
  constructor() {
    super("Access is not permitted.");
    this.name = "AuthorizationError";
  }
}

export async function requirePermission(
  permission: AppPermission,
): Promise<AuthorizationContext> {
  const context = await getAuthorizationContext();

  if (!hasPermission(context, permission)) {
    redirect("/forbidden");
  }

  return context;
}

export async function requireAnyPermission(
  permissions: readonly AppPermission[],
): Promise<AuthorizationContext> {
  const context = await getAuthorizationContext();

  if (!hasAnyPermission(context, permissions)) {
    redirect("/forbidden");
  }

  return context;
}
