import {
  ArrowLeft,
  ArrowRight,
  Search,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { selectClass } from "@/components/student-management/form-parts";
import {
  getStudentDirectory,
  type StudentFilters,
} from "@/lib/student-management/data";

function statusVariant(status: string) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "INACTIVE" || status === "REPEATING")
    return "warning" as const;
  return "neutral" as const;
}

function queryHref(filters: StudentFilters, page: number) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && key !== "page") params.set(key, value);
  });
  params.set("page", String(page));
  return `/dashboard/students?${params}`;
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<StudentFilters>;
}) {
  const filters = await searchParams;
  const data = await getStudentDirectory(filters);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Student management"
        title="Students"
        description="Search learner profiles, current placements and preserved enrolment history within the selected school."
        actions={
          data.canManage ? (
            <Link className={buttonStyles()} href="/dashboard/students/new">
              <UserRoundPlus aria-hidden="true" className="size-4" />
              Admit student
            </Link>
          ) : undefined
        }
      />
      <Card className="p-4 sm:p-5">
        <form
          className="grid gap-3 lg:grid-cols-[minmax(14rem,1.6fr)_repeat(4,minmax(9rem,1fr))_auto]"
          role="search"
        >
          <div className="relative">
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-3.5 left-3.5 size-4"
            />
            <Input
              name="q"
              defaultValue={filters.q}
              className="pl-10"
              placeholder="Name, admission number or class"
              aria-label="Search students"
            />
          </div>
          <select
            name="status"
            defaultValue={filters.status ?? ""}
            className={selectClass}
            aria-label="Student status"
          >
            <option value="">All student statuses</option>
            {[
              "ACTIVE",
              "INACTIVE",
              "TRANSFERRED",
              "WITHDRAWN",
              "COMPLETED",
              "DECEASED",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
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
            name="grade"
            defaultValue={filters.grade ?? ""}
            className={selectClass}
            aria-label="Grade level"
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
          <button
            className={buttonStyles({ variant: "secondary" })}
            type="submit"
          >
            Apply
          </button>
        </form>
      </Card>
      {data.students.length ? (
        <>
          <div className="bg-surface hidden overflow-x-auto rounded-xl border md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Student</th>
                  <th className="px-5 py-3 font-semibold">Admission no.</th>
                  <th className="px-5 py-3 font-semibold">Current class</th>
                  <th className="px-5 py-3 font-semibold">Class no.</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.students.map((student) => (
                  <tr
                    key={student.student_id}
                    className="hover:bg-surface-muted/60"
                  >
                    <td className="p-0">
                      <Link
                        className="focus-visible:ring-focus/30 block px-5 py-4 font-semibold outline-none focus-visible:ring-3"
                        href={`/dashboard/students/${student.student_id}`}
                      >
                        {student.last_name}, {student.first_name}{" "}
                        {student.middle_name}
                      </Link>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs">
                      {student.admission_number}
                    </td>
                    <td className="px-5 py-4">
                      {student.grade_name && student.class_name
                        ? `${student.grade_name} · ${student.class_name}`
                        : "Not enrolled"}
                    </td>
                    <td className="px-5 py-4">{student.class_number ?? "—"}</td>
                    <td className="px-5 py-4">
                      <Badge variant={statusVariant(student.student_status)}>
                        {student.student_status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 md:hidden">
            {data.students.map((student) => (
              <Link
                key={student.student_id}
                href={`/dashboard/students/${student.student_id}`}
                className="focus-visible:ring-focus/30 bg-surface rounded-xl border p-4 outline-none focus-visible:ring-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">
                      {student.first_name} {student.middle_name}{" "}
                      {student.last_name}
                    </p>
                    <p className="text-muted-foreground mt-1 font-mono text-xs">
                      {student.admission_number}
                    </p>
                  </div>
                  <Badge variant={statusVariant(student.student_status)}>
                    {student.student_status}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-3 text-sm">
                  {student.grade_name && student.class_name
                    ? `${student.grade_name} · ${student.class_name}`
                    : "Not currently enrolled"}
                  {student.class_number ? ` · No. ${student.class_number}` : ""}
                </p>
              </Link>
            ))}
          </div>
          <nav
            className="flex items-center justify-between gap-4"
            aria-label="Student directory pagination"
          >
            <p className="text-muted-foreground text-sm">
              Page {data.page} of {pages} · {data.total} students
            </p>
            <div className="flex gap-2">
              {data.page > 1 ? (
                <Link
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                  href={queryHref(filters, data.page - 1)}
                >
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  Previous
                </Link>
              ) : null}
              {data.page < pages ? (
                <Link
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                  href={queryHref(filters, data.page + 1)}
                >
                  Next
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              ) : null}
            </div>
          </nav>
        </>
      ) : (
        <EmptyState
          icon={UsersRound}
          title="No students match these filters"
          description="Adjust the search or filters. Managers can admit the first student without exposing records from another school."
          action={
            data.canManage ? (
              <Link className={buttonStyles()} href="/dashboard/students/new">
                Admit student
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
