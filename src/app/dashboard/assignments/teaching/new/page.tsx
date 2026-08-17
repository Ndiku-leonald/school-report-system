import { BookOpen } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import {
  TeachingAssignmentCreateForm,
  selectClass,
} from "@/components/teacher-assignments/assignment-forms";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAssignmentReferenceData,
  getEligibleSubjectTeachers,
} from "@/lib/teacher-assignments/data";
import type { AssignmentScopeSelection } from "@/lib/teacher-assignments/types";
import { requirePermission } from "@/lib/authorization/guards";

export default async function NewTeachingAssignmentPage({
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
  const mappedSubjectIds = new Set(
    data.mappings
      .filter((item) => item.grade_level_id === section?.grade_level_id)
      .map((item) => item.subject_id),
  );
  const subjects = data.subjects.filter(
    (item) => item.is_active && mappedSubjectIds.has(item.id),
  );
  const startsOn = selection.starts || term?.starts_on || "";
  const endsOn = selection.ends || "";
  const ready = Boolean(
    term &&
    section?.is_active &&
    selection.subject &&
    subjects.some((subject) => subject.id === selection.subject) &&
    startsOn,
  );
  const teachers = ready
    ? await getEligibleSubjectTeachers({
        termId: term!.id,
        classSectionId: section!.id,
        subjectId: selection.subject,
        startsOn,
        endsOn,
        isPrimary: false,
      })
    : [];
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Teacher assignments"
        title="Assign a subject teacher"
        description="Choose the academic scope first, then select a staff membership with a live subject-teacher role."
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
              name="subject"
              defaultValue={selection.subject ?? ""}
              className={selectClass}
              aria-label="Mapped subject"
            >
              <option value="">Select mapped subject</option>
              {subjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
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
            <TeachingAssignmentCreateForm
              scope={{
                termId: term!.id,
                classSectionId: section!.id,
                startsOn,
                endsOn: endsOn || null,
              }}
              subjectId={selection.subject!}
              teachers={teachers}
            />
          ) : (
            <Alert title="Choose a complete scope">
              <BookOpen aria-hidden="true" className="mr-2 inline size-4" />
              Term selection filters classes; class selection filters subjects
              to the mapped grade curriculum.
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
