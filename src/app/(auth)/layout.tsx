import { ArrowLeft, BookOpenCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="bg-background grid min-h-[100dvh] lg:grid-cols-[0.78fr_1.22fr]">
      <aside className="bg-primary text-primary-foreground hidden p-10 lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-3 font-bold">
          <span className="flex size-10 items-center justify-center rounded-lg bg-white/12">
            <BookOpenCheck aria-hidden="true" className="size-5" />
          </span>
          Academic Results System
        </Link>
        <div className="max-w-md">
          <p className="text-sm font-bold tracking-[0.16em] text-white/70 uppercase">
            Staff workspace
          </p>
          <p className="mt-4 text-3xl leading-tight font-bold tracking-tight">
            Secure academic work starts with clear boundaries.
          </p>
          <p className="mt-4 text-sm leading-6 text-white/75">
            Staff identity, account status, and school membership are verified
            before academic workspaces are opened.
          </p>
        </div>
        <p className="text-xs text-white/60">
          Never share passwords or invitation links.
        </p>
      </aside>
      <section className="flex min-h-[100dvh] flex-col">
        <div className="px-4 py-5 sm:px-8">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-focus/25 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold outline-none focus-visible:ring-3"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to home
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          {children}
        </div>
      </section>
    </main>
  );
}
