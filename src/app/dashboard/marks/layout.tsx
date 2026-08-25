import type { ReactNode } from "react";

import { requireAnyPermission } from "@/lib/authorization/guards";

export default async function MarksOverviewLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAnyPermission([
    "MARKS_VIEW_ALL",
    "MARKS_REVIEW",
    "MARKS_APPROVE",
    "MARKS_LOCK",
  ]);
  return children;
}
