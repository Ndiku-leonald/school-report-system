import { PageHeader } from "@/components/layout/page-header";
import { ProfileForm } from "@/components/student-management/profile-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePermission } from "@/lib/authorization/guards";
import { getStudentRecord } from "@/lib/student-management/data";

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  await requirePermission("STUDENTS_MANAGE");
  const { studentId } = await params;
  const { student } = await getStudentRecord(studentId);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={student.admission_number}
        title="Edit student profile"
        description="Update identity details with optimistic concurrency. Lifecycle and enrolment changes remain separate workflows."
      />
      <Card>
        <CardHeader>
          <CardTitle>Profile details</CardTitle>
          <CardDescription>
            Status, placement and photo cannot be altered through this form.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm student={student} />
        </CardContent>
      </Card>
    </div>
  );
}
