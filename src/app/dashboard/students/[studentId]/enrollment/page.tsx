import { PageHeader } from "@/components/layout/page-header";
import { EnrollmentManager } from "@/components/student-management/management-panels";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePermission } from "@/lib/authorization/guards";
import { getStudentRecord } from "@/lib/student-management/data";

export default async function StudentEnrollmentPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  await requirePermission("STUDENTS_MANAGE");
  const { studentId } = await params;
  const data = await getStudentRecord(studentId);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={data.student.admission_number}
        title="Manage enrolment"
        description={`Create, move or close placements for ${data.student.first_name} ${data.student.last_name} without rewriting academic history.`}
      />
      <Card>
        <CardHeader>
          <CardTitle>Placement workflow</CardTitle>
          <CardDescription>
            Moves remain within one academic year and stop once marks,
            attendance, comments, reports or promotion records depend on the
            enrolment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EnrollmentManager
            student={data.student}
            history={data.history}
            years={data.years}
            classes={data.classes}
            canOverrideCapacity={data.canOverrideCapacity}
            today={new Date().toISOString().slice(0, 10)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
