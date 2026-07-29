import type { LucideIcon } from "lucide-react";

import type { AppPermission } from "@/lib/authorization/permissions";

export type NavigationItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
  permissions: readonly AppPermission[];
  unavailable?: boolean;
};
