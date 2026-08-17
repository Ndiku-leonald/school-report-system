import { BookOpen, Plus, School, UsersRound } from "lucide-react";
import Link from "next/link";

import { selectClass } from "@/components/teacher-assignments/assignment-forms";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAssignmentDirectory } from "@/lib/teacher-assignments/data";
import type {
  AssignmentFilters,
  ClassTeacherAssignmentRow,
  TeachingAssignmentRow,
} from "@/lib/teacher-assignments/types";

function statusVariant(status: string) {
  if (status === "CURRENT") return "success" as const;
  if (status === "UPCOMING") return "info" as const;
  if (status === "INACTIVE") return "warning" as const;
  return "neutral" as const;
}

function dateLabel(value: string | null) {
  if (!value) return "Term end";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function directoryHref(filters: AssignmentFilters, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && key !== "page") params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  return `/dashboard/assignments?${params.toString()}`;
}

function AssignmentCard({
  row,
  kind,
}: {
  row: TeachingAssignmentRow | ClassTeacherAssignmentRow;
  kind: "teaching" | "class-teachers";
}) {
  const subject = "subject_name" in row ? row.subject_name : null;
  const designation =
    "is_primary" in row
      ? row.is_primary
        ? "Primary"
        : "Assistant"
      : row.teacher_role.replaceAll("_", " ");
  return (
    <Link
      href={`/dashboard/assignments/${kind}/${row.assignment_id}`}
      className="focus-visible:ring-focus/30 bg-surface rounded-xl border p-4 outline-none hover:shadow-sm focus-visible:ring-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{row.teacher_name}</p>
          <p className="text-muted-foreground mt-1 font-mono text-xs">
            {row.employee_number}
          </p>
        </div>
        <Badge variant={statusVariant(row.period_status)}>
          {row.period_status}
        </Badge>
      </div>
      <p className="mt-3 text-sm font-semibold">
        {row.grade_name} · {row.class_name}
        {subject ? ` · ${subject}` : ""}
      </p>
      <p className="text-muted-foreground mt-1 text-sm">
        {row.academic_year_name} · {row.term_name} · {designation}
      </p>
      <p className="text-muted-foreground mt-2 text-xs">
        {dateLabel(row.starts_on)} – {dateLabel(row.ends_on)}
      </p>
    </Link>
  );
}

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<AssignmentFilters>;
}) {
  const requestedFilters = await searchParams;
  const data = await getAssignmentDirectory(requestedFilters);
  const filters = data.filters;
  const view = filters.view === "class" ? "class" : "subject";
  const rows = view === "subject" ? data.teaching : data.classTeachers;
  const total =
    view === "subject" ? data.teachingTotal : data.classTeacherTotal;
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Academic staffing"
        title="Teacher assignments"
        description="Manage effective-dated subject and class responsibilities without rewriting historical ownership."
        actions={
          data.canManage ? (
            <div className="flex flex-wrap gap-2">
              <Link
                className={buttonStyles({ variant: "secondary" })}
                href="/dashboard/assignments/class-teachers/new"
              >
                <School aria-hidden="true" className="size-4" />
                Assign class teacher
              </Link>
              <Link
                className={buttonStyles()}
                href="/dashboard/assignments/teaching/new"
              >
                <Plus aria-hidden="true" className="size-4" />
                Assign subject teacher
              </Link>
            </div>
          ) : (
            <Badge variant="info">View only</Badge>
          )
        }
      />

      <nav className="flex gap-2" aria-label="Assignment type">
        <Link
          href="/dashboard/assignments?view=subject"
          className={buttonStyles({
            variant: view === "subject" ? "primary" : "secondary",
          })}
        >
          <BookOpen aria-hidden="true" className="size-4" />
          Subject teachers
        </Link>
        <Link
          href="/dashboard/assignments?view=class"
          className={buttonStyles({
            variant: view === "class" ? "primary" : "secondary",
          })}
        >
          <School aria-hidden="true" className="size-4" />
          Class teachers
        </Link>
      </nav>

      <Card className="p-4 sm:p-5">
        <form
          className="grid gap-3 md:grid-cols-3 xl:grid-cols-7"
          role="search"
        >
          <input type="hidden" name="view" value={view} />
          <select
            name="year"
            defaultValue={filters.year ?? ""}
            className={selectClass}
            aria-label="Academic year"
          >
            <option value="">All academic years</option>
            {data.years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
              </option>
            ))}
          </select>
          <select
            name="term"
            defaultValue={filters.term ?? ""}
            className={selectClass}
            aria-label="Term"
          >
            <option value="">All terms</option>
            {data.terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.name}
              </option>
            ))}
          </select>
          <select
            name="grade"
            defaultValue={filters.grade ?? ""}
            className={selectClass}
            aria-label="Grade"
          >
            <option value="">All grades</option>
            {data.grades.map((grade) => (
              <option key={grade.id} value={grade.id}>
                {grade.name}
              </option>
            ))}
          </select>
          <select
            name="class"
            defaultValue={filters.class ?? ""}
            className={selectClass}
            aria-label="Class section"
          >
            <option value="">All classes</option>
            {data.classes.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
          {view === "subject" ? (
            <select
              name="subject"
              defaultValue={filters.subject ?? ""}
              className={selectClass}
              aria-label="Subject"
            >
              <option value="">All subjects</option>
              {data.subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              name="designation"
              defaultValue={filters.designation ?? ""}
              className={selectClass}
              aria-label="Designation"
            >
              <option value="">Primary and assistant</option>
              <option value="primary">Primary</option>
              <option value="assistant">Assistant</option>
            </select>
          )}
          <select
            name="period"
            defaultValue={filters.period ?? ""}
            className={selectClass}
            aria-label="Period status"
          >
            <option value="">All periods</option>
            <option value="CURRENT">Current</option>
            <option value="UPCOMING">Future</option>
            <option value="ENDED">Ended</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <select
            name="teacher"
            defaultValue={filters.teacher ?? ""}
            className={selectClass}
            aria-label="Teacher"
          >
            <option value="">All teachers</option>
            {data.teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2 md:col-span-3 xl:col-span-7">
            <button className={buttonStyles({ size: "sm" })} type="submit">
              Apply filters
            </button>
            <Link
              className={buttonStyles({ variant: "ghost", size: "sm" })}
              href={`/dashboard/assignments?view=${view}`}
            >
              Clear
            </Link>
          </div>
        </form>
      </Card>

      {rows.length ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <AssignmentCard
                key={row.assignment_id}
                row={row}
                kind={view === "subject" ? "teaching" : "class-teachers"}
              />
            ))}
          </div>
          <nav
            className="flex items-center justify-between gap-3"
            aria-label="Assignment pages"
          >
            <p className="text-muted-foreground text-sm">Page {data.page}</p>
            <div className="flex gap-2">
              {data.page > 1 ? (
                <Link
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                  href={directoryHref(filters, data.page - 1)}
                >
                  Previous
                </Link>
              ) : null}
              {data.page * data.pageSize < total ? (
                <Link
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                  href={directoryHref(filters, data.page + 1)}
                >
                  Next
                </Link>
              ) : null}
            </div>
          </nav>
        </>
      ) : (
        <EmptyState
          icon={UsersRound}
          title="No assignments match these filters"
          description="Adjust the selected school scope or create the first role-eligible assignment."
        />
      )}
    </div>
  );
}
