import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { dashboardNavigation } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      activeHref="/dashboard"
      navigation={dashboardNavigation}
      section="Administration"
    >
      {children}
    </AppShell>
  );
}
