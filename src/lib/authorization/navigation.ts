import type { NavigationItem } from "@/types/navigation";

import { hasAnyPermission, type PermissionContext } from "./permissions";

export function filterNavigation(
  navigation: readonly NavigationItem[],
  context: PermissionContext,
) {
  return navigation.filter((item) =>
    hasAnyPermission(context, item.permissions),
  );
}
