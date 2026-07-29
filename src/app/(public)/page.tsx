import {
  ArrowRight,
  BookOpenCheck,
  ClipboardCheck,
  FileLock2,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";

const workflowItems = [
  {
    title: "Controlled academic workflow",
    description: "Prepare, review, approve, and publish through clear stages.",
    icon: ClipboardCheck,
  },
  {
    title: "Private by design",
    description:
      "Academic information remains restricted to authorised access.",
    icon: FileLock2,
  },
  {
    title: "Configurable for each school",
    description:
      "Branding and academic rules will be configured in later stages.",
    icon: BookOpenCheck,
  },
];

export default function LandingPage() {
  return (
    <main>
      <section className="border-border bg-surface relative overflow-hidden border-b">
        <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.15fr_0.85fr] lg:gap-20 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <Badge variant="success">Foundation stage</Badge>
            <h1 className="text-foreground mt-6 text-4xl leading-[1.05] font-bold tracking-[-0.035em] sm:text-5xl lg:text-6xl">
              Academic results, handled with care and clear oversight.
            </h1>
            <p className="text-muted-foreground mt-6 max-w-[62ch] text-base leading-7 sm:text-lg">
              The Primary School Academic Results and Report Management System
              will support staff workflows, secure report publication, and
              verified parent access from one dependable workspace.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/staff-login"
                className={buttonStyles({ size: "lg" })}
              >
                Staff sign in
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link
                href="/parent"
                className={buttonStyles({ size: "lg", variant: "secondary" })}
              >
                Access a student report
              </Link>
            </div>
            <div className="border-border text-muted-foreground mt-8 flex max-w-xl gap-3 border-t pt-5 text-sm leading-6">
              <ShieldCheck
                aria-hidden="true"
                className="text-primary mt-0.5 size-5 shrink-0"
              />
              <p>
                Only authorised users may access academic information. No live
                student data is connected during this foundation stage.
              </p>
            </div>
          </div>

          <div className="relative md:pl-6">
            <div
              aria-hidden="true"
              className="bg-primary-soft/60 absolute -inset-6 rounded-[2rem]"
            />
            <div className="border-border bg-surface relative overflow-hidden rounded-2xl border shadow-[0_30px_80px_-55px_var(--shadow-color)]">
              <div className="border-border flex items-center justify-between border-b px-5 py-4">
                <div>
                  <p className="text-primary text-xs font-bold tracking-[0.15em] uppercase">
                    Academic workflow
                  </p>
                  <p className="text-foreground mt-1 text-sm font-semibold">
                    Built for accountable progress
                  </p>
                </div>
                <span className="bg-success size-2 rounded-full" />
              </div>
              <ol className="divide-border divide-y">
                {workflowItems.map((item, index) => {
                  const Icon = item.icon;

                  return (
                    <li
                      key={item.title}
                      className="grid grid-cols-[2.5rem_1fr_auto] items-start gap-4 px-5 py-5"
                    >
                      <span className="bg-primary-soft text-primary flex size-10 items-center justify-center rounded-lg">
                        <Icon aria-hidden="true" className="size-5" />
                      </span>
                      <div>
                        <h2 className="text-foreground text-sm font-bold">
                          {item.title}
                        </h2>
                        <p className="text-muted-foreground mt-1 text-sm leading-6">
                          {item.description}
                        </p>
                      </div>
                      <span className="text-muted-foreground font-mono text-xs">
                        0{index + 1}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
