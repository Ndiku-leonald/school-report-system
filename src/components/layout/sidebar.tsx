import { BookOpenCheck, LockKeyhole } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import type { NavigationItem } from "@/types/navigation";

type SidebarProps = {
  activeHref?: string;
  navigation: NavigationItem[];
};

function NavigationList({ activeHref, navigation }: SidebarProps) {
  return (
    <ul className="grid gap-1">
      {navigation.map((item) => {
        const Icon = item.icon;
        const isActive = item.href === activeHref;

        return (
          <li key={item.label}>
            {item.href && !item.unavailable ? (
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-focus/25 flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-3",
                  isActive
                    ? "bg-primary-soft text-primary-strong"
                    : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                )}
              >
                <Icon aria-hidden="true" className="size-[18px]" />
                <span>{item.label}</span>
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="text-muted-foreground/65 flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium"
              >
                <Icon aria-hidden="true" className="size-[18px]" />
                <span className="min-w-0 flex-1">{item.label}</span>
                <Badge className="hidden xl:inline-flex">Later</Badge>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar({ activeHref, navigation }: SidebarProps) {
  return (
    <aside className="border-border bg-surface border-b lg:sticky lg:top-0 lg:h-[100dvh] lg:border-r lg:border-b-0">
      <div className="border-border flex min-h-16 items-center gap-3 border-b px-4 sm:px-6">
        <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
          <BookOpenCheck aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-foreground truncate text-sm font-bold">
            Academic Results
          </p>
          <p className="text-muted-foreground text-xs">School workspace</p>
        </div>
      </div>

      <nav aria-label="Workspace navigation" className="hidden p-4 lg:block">
        <NavigationList activeHref={activeHref} navigation={navigation} />
      </nav>

      <details className="group p-3 lg:hidden">
        <summary className="text-foreground hover:bg-surface-muted focus-visible:ring-focus/25 flex min-h-10 cursor-pointer list-none items-center justify-between rounded-lg px-3 text-sm font-semibold outline-none focus-visible:ring-3">
          Workspace navigation
          <span className="text-muted-foreground text-xs group-open:hidden">
            Open
          </span>
          <span className="text-muted-foreground hidden text-xs group-open:inline">
            Close
          </span>
        </summary>
        <nav aria-label="Mobile workspace navigation" className="pt-2">
          <NavigationList activeHref={activeHref} navigation={navigation} />
        </nav>
      </details>

      <div className="border-border mt-auto hidden border-t p-4 lg:block">
        <div className="bg-surface-muted flex gap-3 rounded-lg p-3">
          <LockKeyhole
            aria-hidden="true"
            className="text-primary mt-0.5 size-4 shrink-0"
          />
          <p className="text-muted-foreground text-xs leading-5">
            Access controls and live data arrive in later stages.
          </p>
        </div>
      </div>
    </aside>
  );
}
