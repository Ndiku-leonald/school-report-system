import type { ReactNode } from "react";

import { requireAnyPermission } from "@/lib/authorization/guards";

export default async function AssignmentsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAnyPermission(["ASSIGNMENTS_VIEW_ALL", "ASSIGNMENTS_MANAGE"]);
  return children;
}
