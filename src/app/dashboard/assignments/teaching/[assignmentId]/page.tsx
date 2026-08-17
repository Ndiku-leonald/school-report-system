import { Pencil } from "lucide-react";
import Link from "next/link";

import { AssignmentEndForm } from "@/components/teacher-assignments/assignment-forms";
import { AssignmentSummary } from "@/components/teacher-assignments/assignment-summary";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAssignmentReferenceData,
  getTeachingAssignment,
} from "@/lib/teacher-assignments/data";

export default async function TeachingAssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const [assignment, reference] = await Promise.all([
    getTeachingAssignment(assignmentId),
    getAssignmentReferenceData(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Subject teacher"
        title={`${assignment.grade_name} · ${assignment.subject_name}`}
        description="Effective-dated subject responsibility and preserved assignment history."
        actions={
          reference.canManage &&
          assignment.period_status !== "ENDED" &&
          assignment.period_status !== "INACTIVE" ? (
            <Link
              className={buttonStyles({ variant: "secondary" })}
              href={`/dashboard/assignments/teaching/${assignmentId}/edit`}
            >
              <Pencil aria-hidden="true" className="size-4" />
              Edit dates
            </Link>
          ) : undefined
        }
      />
      <AssignmentSummary assignment={assignment} />
      {reference.canManage && assignment.ends_on === null ? (
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
              kind="teaching"
            />
          </CardContent>
        </Card>
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
