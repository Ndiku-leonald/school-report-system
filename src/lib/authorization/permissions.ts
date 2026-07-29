import type { Database } from "@/types/database.generated";

export type AppPermission = Database["public"]["Enums"]["app_permission"];

export type PermissionContext = {
  permissions: ReadonlySet<AppPermission>;
};

export function hasPermission(
  context: PermissionContext,
  permission: AppPermission,
) {
  return context.permissions.has(permission);
}

export function hasAnyPermission(
  context: PermissionContext,
  permissions: readonly AppPermission[],
) {
  return permissions.some((permission) => hasPermission(context, permission));
}
