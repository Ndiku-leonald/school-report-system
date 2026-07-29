import { SearchX } from "lucide-react";
import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="bg-background flex min-h-[100dvh] items-center justify-center px-4 py-16">
      <section className="max-w-lg text-center">
        <span className="bg-primary-soft text-primary mx-auto flex size-12 items-center justify-center rounded-xl">
          <SearchX aria-hidden="true" className="size-6" />
        </span>
        <p className="text-primary mt-5 text-xs font-bold tracking-[0.16em] uppercase">
          Page not found
        </p>
        <h1 className="text-foreground mt-3 text-3xl font-bold tracking-tight">
          The requested page is unavailable.
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-6">
          The address may be incorrect, or the module may belong to a later
          development stage.
        </p>
        <Link href="/" className={buttonStyles({ className: "mt-6" })}>
          Return home
        </Link>
      </section>
    </main>
  );
}
