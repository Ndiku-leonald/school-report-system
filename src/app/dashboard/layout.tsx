import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { dashboardNavigation } from "@/lib/navigation";
import { requireActiveStaff } from "@/lib/auth/access";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
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
      activeHref="/dashboard"
      navigation={dashboardNavigation}
      schoolName={context.activeMembership.school.name}
      section="Administration"
      staffName={staffName}
    >
      {children}
    </AppShell>
  );
}
