import type { ReactNode } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import type { NavigationItem } from "@/types/navigation";

type AppShellProps = {
  activeHref?: string;
  children: ReactNode;
  navigation: NavigationItem[];
  section: string;
};

export function AppShell({
  activeHref,
  children,
  navigation,
  section,
}: AppShellProps) {
  return (
    <div className="bg-background min-h-[100dvh] lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <Sidebar activeHref={activeHref} navigation={navigation} />
      <div className="min-w-0">
        <Topbar section={section} />
        <main className="mx-auto w-full max-w-[1400px] p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
