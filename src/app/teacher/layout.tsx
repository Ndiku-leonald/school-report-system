import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/authorization/guards";
import { filterNavigation } from "@/lib/authorization/navigation";
import { teacherNavigation } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Teacher workspace",
  robots: { index: false, follow: false },
};

export default async function TeacherLayout({
  children,
}: {
  children: ReactNode;
}) {
  const context = await requirePermission("TEACHER_WORKSPACE_VIEW");
  const staffName = context.staff.profile
    ? `${context.staff.profile.first_name} ${context.staff.profile.last_name}`
    : "Staff member";

  return (
    <AppShell
      activeHref="/teacher"
      navigation={filterNavigation(teacherNavigation, context)}
      schoolName={context.staff.activeMembership.school.name}
      section="Teacher workspace"
      staffName={staffName}
    >
      {children}
    </AppShell>
  );
}
