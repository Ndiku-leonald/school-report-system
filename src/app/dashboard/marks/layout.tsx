import type { ReactNode } from "react";

import { requirePermission } from "@/lib/authorization/guards";

export default async function MarksOverviewLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePermission("MARKS_VIEW_ALL");
  return children;
}
