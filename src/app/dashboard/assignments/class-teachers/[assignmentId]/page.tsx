import { Pencil, Repeat2 } from "lucide-react";
import Link from "next/link";

import {
  AssignmentEndForm,
  PrimaryReplacementForm,
} from "@/components/teacher-assignments/assignment-forms";
import { AssignmentSummary } from "@/components/teacher-assignments/assignment-summary";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAssignmentReferenceData,
  getClassTeacherAssignment,
  getEligibleClassTeachers,
} from "@/lib/teacher-assignments/data";

function tomorrowOrStart(startsOn: string) {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const dayAfterStart = new Date(`${startsOn}T00:00:00Z`);
  dayAfterStart.setUTCDate(dayAfterStart.getUTCDate() + 1);
  return [
    tomorrow.toISOString().slice(0, 10),
    dayAfterStart.toISOString().slice(0, 10),
  ]
    .sort()
    .at(-1)!;
}

export default async function ClassTeacherAssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const [assignment, reference] = await Promise.all([
    getClassTeacherAssignment(assignmentId),
    getAssignmentReferenceData(),
  ]);
  const replacementStart = tomorrowOrStart(assignment.starts_on);
  const mayReplace =
    reference.canManage &&
    assignment.is_primary &&
    assignment.ends_on === null &&
    replacementStart <= assignment.term_ends_on;
  const eligible = mayReplace
    ? await getEligibleClassTeachers({
        termId: assignment.term_id,
        classSectionId: assignment.class_section_id,
        startsOn: replacementStart,
        endsOn: "",
        isPrimary: true,
      })
    : [];
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Class teacher"
        title={`${assignment.grade_name} · ${assignment.class_name}`}
        description="Effective-dated class responsibility and preserved primary or assistant history."
        actions={
          reference.canManage &&
          assignment.period_status !== "ENDED" &&
          assignment.period_status !== "INACTIVE" ? (
            <Link
              className={buttonStyles({ variant: "secondary" })}
              href={`/dashboard/assignments/class-teachers/${assignmentId}/edit`}
            >
              <Pencil aria-hidden="true" className="size-4" />
              Edit dates
            </Link>
          ) : undefined
        }
      />
      <AssignmentSummary assignment={assignment} />
      {reference.canManage && assignment.ends_on === null ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>End assignment</CardTitle>
            </CardHeader>
            <CardContent>
              <AssignmentEndForm
                assignmentId={assignmentId}
                expectedUpdatedAt={assignment.updated_at}
                defaultEnd={
                  today < assignment.starts_on ? assignment.starts_on : today
                }
                kind="class"
              />
            </CardContent>
          </Card>
          {mayReplace ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Repeat2 aria-hidden="true" className="size-5" />
                  Replace primary teacher
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PrimaryReplacementForm
                  termId={assignment.term_id}
                  classSectionId={assignment.class_section_id}
                  teachers={eligible}
                  defaultStart={replacementStart}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : (
        <Alert
          title={
            reference.canManage ? "Historical assignment" : "View-only access"
          }
        >
          This record is retained for historical ownership and cannot be
          deleted.
        </Alert>
      )}
    </div>
  );
}
