import { School } from "lucide-react";

import { requirePermission } from "@/lib/authorization/guards";
import { PageHeader } from "@/components/layout/page-header";
import {
  ClassTeacherAssignmentCreateForm,
  selectClass,
} from "@/components/teacher-assignments/assignment-forms";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAssignmentReferenceData,
  getEligibleClassTeachers,
} from "@/lib/teacher-assignments/data";
import type { AssignmentScopeSelection } from "@/lib/teacher-assignments/types";

export default async function NewClassTeacherAssignmentPage({
  searchParams,
}: {
  searchParams: Promise<AssignmentScopeSelection>;
}) {
  await requirePermission("ASSIGNMENTS_MANAGE");
  const selection = await searchParams;
  const data = await getAssignmentReferenceData();
  const availableYearIds = new Set(
    data.years
      .filter((year) => !["CLOSED", "ARCHIVED"].includes(year.status))
      .map((year) => year.id),
  );
  const availableTerms = data.terms.filter(
    (item) =>
      item.status !== "CLOSED" && availableYearIds.has(item.academic_year_id),
  );
  const term = availableTerms.find((item) => item.id === selection.term);
  const classes = data.classes.filter(
    (item) => !term || item.academic_year_id === term.academic_year_id,
  );
  const section = classes.find((item) => item.id === selection.class);
  const startsOn = selection.starts || term?.starts_on || "";
  const endsOn = selection.ends || "";
  const isPrimary = selection.primary !== "false";
  const ready = Boolean(term && section?.is_active && startsOn);
  const teachers = ready
    ? await getEligibleClassTeachers({
        termId: term!.id,
        classSectionId: section!.id,
        startsOn,
        endsOn,
        isPrimary,
      })
    : [];
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Teacher assignments"
        title="Assign a class teacher"
        description="Primary periods are exclusive; assistant class teachers may coexist."
      />
      <Card>
        <CardHeader>
          <CardTitle>1. Select assignment scope</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <select
              name="term"
              defaultValue={selection.term ?? ""}
              className={selectClass}
              aria-label="Term"
              required
            >
              <option value="">Select term</option>
              {availableTerms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              name="class"
              defaultValue={selection.class ?? ""}
              className={selectClass}
              aria-label="Class section"
              required
            >
              <option value="">Select class</option>
              {classes
                .filter((item) => item.is_active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
            <select
              name="primary"
              defaultValue={selection.primary ?? "true"}
              className={selectClass}
              aria-label="Designation"
            >
              <option value="true">Primary class teacher</option>
              <option value="false">Assistant class teacher</option>
            </select>
            <input
              className={selectClass}
              aria-label="Start date"
              name="starts"
              type="date"
              defaultValue={startsOn}
              min={term?.starts_on}
              max={term?.ends_on}
            />
            <input
              className={selectClass}
              aria-label="End date"
              name="ends"
              type="date"
              defaultValue={endsOn}
              min={startsOn || term?.starts_on}
              max={term?.ends_on}
            />
            <button
              className="bg-primary text-primary-foreground min-h-11 rounded-lg px-4 text-sm font-semibold"
              type="submit"
            >
              Load eligible teachers
            </button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>2. Confirm teacher</CardTitle>
        </CardHeader>
        <CardContent>
          {ready ? (
            <ClassTeacherAssignmentCreateForm
              scope={{
                termId: term!.id,
                classSectionId: section!.id,
                startsOn,
                endsOn: endsOn || null,
              }}
              isPrimary={isPrimary}
              teachers={teachers}
            />
          ) : (
            <Alert title="Choose a complete scope">
              <School aria-hidden="true" className="mr-2 inline size-4" />
              Select a term, matching active class and inclusive effective
              dates.
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
