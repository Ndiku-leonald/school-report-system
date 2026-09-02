import { ArrowLeft, BookOpenCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export default function ParentLayout({ children }: { children: ReactNode }) {
  return (
    <main className="bg-background min-h-[100dvh]">
      <header className="border-border bg-surface border-b">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="text-foreground focus-visible:ring-focus/25 flex items-center gap-3 rounded-lg font-bold outline-none focus-visible:ring-3"
          >
            <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
              <BookOpenCheck aria-hidden="true" className="size-5" />
            </span>
            <span className="hidden sm:inline">Academic Results System</span>
          </Link>
          <Link
            href="/"
            className="text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:ring-focus/25 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus-visible:ring-3"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Home
          </Link>
          <form action="/parent/api/logout" method="post">
            <button
              type="submit"
              className="text-muted-foreground hover:bg-surface-muted hover:text-foreground rounded-lg px-3 py-2 text-sm font-semibold"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 sm:py-16 md:grid-cols-[0.8fr_1.2fr] md:items-center lg:gap-16">
        <aside>
          <span className="bg-primary-soft text-primary flex size-11 items-center justify-center rounded-xl">
            <ShieldCheck aria-hidden="true" className="size-6" />
          </span>
          <p className="text-primary mt-6 text-xs font-bold tracking-[0.16em] uppercase">
            Private report access
          </p>
          <h1 className="text-foreground mt-3 text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
            View a student&apos;s published reports.
          </h1>
          <p className="text-muted-foreground mt-4 text-base leading-7">
            Sign in with the one-time access code and PIN issued by the school.
            Only published report-card artifacts for an eligible student are
            available here.
          </p>
        </aside>
        {children}
      </div>
    </main>
  );
}
