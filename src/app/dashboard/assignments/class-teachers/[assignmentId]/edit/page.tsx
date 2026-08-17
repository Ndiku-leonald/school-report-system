import { AssignmentPeriodForm } from "@/components/teacher-assignments/assignment-forms";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/lib/authorization/guards";
import { getClassTeacherAssignment } from "@/lib/teacher-assignments/data";

export default async function EditClassTeacherAssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  await requirePermission("ASSIGNMENTS_MANAGE");
  const { assignmentId } = await params;
  const assignment = await getClassTeacherAssignment(assignmentId);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Class teacher"
        title="Edit assignment dates"
        description="Teacher, class, term and designation remain immutable; use replacement for a new primary."
      />
      <Card>
        <CardContent className="pt-6">
          <AssignmentPeriodForm
            assignmentId={assignmentId}
            expectedUpdatedAt={assignment.updated_at}
            startsOn={assignment.starts_on}
            endsOn={assignment.ends_on}
            kind="class"
          />
        </CardContent>
      </Card>
    </div>
  );
}
