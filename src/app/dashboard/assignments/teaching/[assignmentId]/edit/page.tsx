import { AssignmentPeriodForm } from "@/components/teacher-assignments/assignment-forms";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/lib/authorization/guards";
import { getTeachingAssignment } from "@/lib/teacher-assignments/data";

export default async function EditTeachingAssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  await requirePermission("ASSIGNMENTS_MANAGE");
  const { assignmentId } = await params;
  const assignment = await getTeachingAssignment(assignmentId);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Subject teacher"
        title="Edit assignment dates"
        description="Identity is immutable. Safe date corrections use optimistic concurrency and preserve academic dependencies."
      />
      <Card>
        <CardContent className="pt-6">
          <AssignmentPeriodForm
            assignmentId={assignmentId}
            expectedUpdatedAt={assignment.updated_at}
            startsOn={assignment.starts_on}
            endsOn={assignment.ends_on}
            kind="teaching"
          />
        </CardContent>
      </Card>
    </div>
  );
}
