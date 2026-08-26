import Link from "next/link";
import type { ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { requirePermission } from "@/lib/authorization/guards";

const sections = [
  ["Overview", "/dashboard/academic"],
  ["Years", "/dashboard/academic/years"],
  ["Grade levels", "/dashboard/academic/grade-levels"],
  ["Classes", "/dashboard/academic/classes"],
  ["Subjects", "/dashboard/academic/subjects"],
  ["Curriculum", "/dashboard/academic/curriculum"],
  ["Assessment", "/dashboard/academic/assessment-schemes"],
  ["Grading", "/dashboard/academic/grading"],
  ["Ranking", "/dashboard/academic/ranking"],
  [
    "Aggregate classifications",
    "/dashboard/academic/aggregate-classifications",
  ],
  ["Promotion", "/dashboard/academic/promotion"],
] as const;

export default async function AcademicConfigurationLayout({
  children,
}: {
  children: ReactNode;
}) {
  const context = await requirePermission("ACADEMIC_CONFIGURATION_VIEW");
  const canManage = context.permissions.has("ACADEMIC_CONFIGURATION_MANAGE");

  return (
    <div className="space-y-6">
      <nav
        aria-label="Academic configuration sections"
        className="overflow-x-auto"
      >
        <ul className="flex min-w-max gap-2">
          {sections.map(([label, href]) => (
            <li key={href}>
              <Link
                href={href}
                className="border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground focus-visible:ring-focus/30 inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-semibold outline-none focus-visible:ring-3"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {!canManage ? (
        <Alert title="Read-only configuration">
          Your selected school role can review academic setup but cannot change
          it.
        </Alert>
      ) : null}
      {children}
    </div>
  );
}
