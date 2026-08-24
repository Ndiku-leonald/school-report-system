import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { requireAnyPermission } from "@/lib/authorization/guards";
import { filterNavigation } from "@/lib/authorization/navigation";
import { dashboardNavigation } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const context = await requireAnyPermission([
    "DASHBOARD_VIEW",
    "ACADEMIC_CONFIGURATION_VIEW",
    "STUDENTS_VIEW_ALL",
    "STUDENTS_VIEW_ASSIGNED",
    "ASSIGNMENTS_VIEW_ALL",
    "ASSIGNMENTS_MANAGE",
    "MARKS_VIEW_ALL",
    "REPORTS_VIEW_ALL",
    "REPORTS_GENERATE",
  ]);
  const staffName = context.staff.profile
    ? `${context.staff.profile.first_name} ${context.staff.profile.last_name}`
    : "Staff member";

  return (
    <AppShell
      activeHref="/dashboard"
      navigation={filterNavigation(dashboardNavigation, context)}
      schoolName={context.staff.activeMembership.school.name}
      section="Administration"
      staffName={staffName}
    >
      {children}
    </AppShell>
  );
}
