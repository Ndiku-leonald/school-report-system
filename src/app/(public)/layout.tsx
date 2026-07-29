import { BookOpenCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background min-h-[100dvh]">
      <header className="border-border bg-surface border-b">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="focus-visible:ring-focus/25 flex items-center gap-3 rounded-lg outline-none focus-visible:ring-3"
          >
            <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
              <BookOpenCheck aria-hidden="true" className="size-5" />
            </span>
            <span className="text-foreground hidden text-sm font-bold sm:inline">
              Academic Results System
            </span>
          </Link>
          <nav
            aria-label="Public navigation"
            className="flex items-center gap-1"
          >
            <Link
              href="/parent"
              className="text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:ring-focus/25 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus-visible:ring-3"
            >
              Parent access
            </Link>
            <Link
              href="/staff-login"
              className="bg-primary text-primary-foreground hover:bg-primary-strong focus-visible:ring-focus/30 rounded-lg px-3.5 py-2 text-sm font-semibold outline-none focus-visible:ring-3"
            >
              Staff sign in
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
