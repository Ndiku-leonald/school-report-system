import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { teacherNavigation } from "@/lib/navigation";
import { requireActiveStaff } from "@/lib/auth/access";

export const metadata: Metadata = {
  title: "Teacher workspace",
  robots: { index: false, follow: false },
};

export default async function TeacherLayout({
  children,
}: {
  children: ReactNode;
}) {
  const context = await requireActiveStaff();
  const staffName = context.profile
    ? `${context.profile.first_name} ${context.profile.last_name}`
    : "Staff member";

  return (
    <AppShell
      activeHref="/teacher"
      navigation={teacherNavigation}
      schoolName={context.activeMembership.school.name}
      section="Teacher workspace"
      staffName={staffName}
    >
      {children}
    </AppShell>
  );
}
