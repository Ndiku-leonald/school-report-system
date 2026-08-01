import type { ReactNode } from "react";

import { requireAnyPermission } from "@/lib/authorization/guards";

export default async function StudentsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAnyPermission(["STUDENTS_VIEW_ALL", "STUDENTS_VIEW_ASSIGNED"]);
  return children;
}
