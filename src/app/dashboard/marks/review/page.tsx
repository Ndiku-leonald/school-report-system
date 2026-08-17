import { ClipboardCheck } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getMarksReviewQueue } from "@/lib/marks-workflow/data";
import type { MarksReviewFilters } from "@/lib/marks-workflow/schemas";

const inputClass =
  "border-border bg-surface min-h-11 rounded-lg border px-3 text-sm";

function queueHref(filters: MarksReviewFilters, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && key !== "page") params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  return `/dashboard/marks/review?${params}`;
}

export default async function MarksReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<MarksReviewFilters>;
}) {
  const data = await getMarksReviewQueue(await searchParams);
  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Selected school"
        title="Marks review queue"
        description="Filter the latest revision for each mark-sheet scope and open an authorized workflow action."
        actions={
          <Link
            className={buttonStyles({ variant: "secondary" })}
            href="/dashboard/marks/terms"
          >
            Term workflow
          </Link>
        }
      />
      <Card className="p-4">
        <form
          className="grid gap-3 md:grid-cols-3 xl:grid-cols-4"
          role="search"
        >
          <select
            aria-label="Workflow status"
            className={inputClass}
            defaultValue={data.filters.status ?? ""}
            name="status"
          >
            <option value="">All workflow states</option>
            {(
              [
                "DRAFT",
                "SUBMITTED",
                "UNDER_REVIEW",
                "RETURNED",
                "APPROVED",
                "LOCKED",
              ] as const
            ).map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          {(
            ["year", "term", "grade", "class", "subject", "teacher"] as const
          ).map((name) => (
            <input
              aria-label={`${name} identifier`}
              className={inputClass}
              defaultValue={data.filters[name] ?? ""}
              key={name}
              name={name}
              placeholder={`${name[0].toUpperCase()}${name.slice(1)} ID (optional)`}
            />
          ))}
          <button className={buttonStyles()} type="submit">
            Apply filters
          </button>
        </form>
      </Card>
      {data.rows.length ? (
        <div className="space-y-3">
          {data.rows.map((row) => (
            <Link
              className="bg-surface border-border block rounded-xl border p-4 transition-shadow hover:shadow-sm"
              href={`/dashboard/marks/review/${row.mark_sheet_id}`}
              key={row.mark_sheet_id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold">
                    {row.grade_name} · {row.class_name} · {row.subject_name}
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {row.academic_year_name} · {row.term_name} ·{" "}
                    {row.teacher_name} ({row.employee_number})
                  </p>
                </div>
                <Badge
                  variant={
                    row.workflow_status === "RETURNED"
                      ? "warning"
                      : row.workflow_status === "LOCKED"
                        ? "success"
                        : "info"
                  }
                >
                  {row.workflow_status.replaceAll("_", " ")}
                </Badge>
              </div>
              <p className="mt-3 text-sm">
                <strong>
                  {row.recorded_required_cells} / {row.expected_required_cells}
                </strong>{" "}
                required cells · revision {row.sheet_version}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ClipboardCheck}
          title="No matching mark sheets"
          description="No latest revisions match these selected-school filters."
        />
      )}
      <nav
        aria-label="Review queue pages"
        className="flex items-center justify-between"
      >
        <span className="text-muted-foreground text-sm">
          Page {data.page} of {lastPage} · {data.total} mark sheets
        </span>
        <div className="flex gap-2">
          {data.page > 1 ? (
            <Link
              className={buttonStyles({ variant: "secondary", size: "sm" })}
              href={queueHref(data.filters, data.page - 1)}
            >
              Previous
            </Link>
          ) : null}
          {data.page < lastPage ? (
            <Link
              className={buttonStyles({ variant: "secondary", size: "sm" })}
              href={queueHref(data.filters, data.page + 1)}
            >
              Next
            </Link>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
