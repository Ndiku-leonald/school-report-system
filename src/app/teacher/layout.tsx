import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { teacherNavigation } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Teacher workspace",
  robots: { index: false, follow: false },
};

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      activeHref="/teacher"
      navigation={teacherNavigation}
      section="Teacher workspace"
    >
      {children}
    </AppShell>
  );
}
