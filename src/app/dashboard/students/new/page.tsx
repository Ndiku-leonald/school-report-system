import { AdmissionForm } from "@/components/student-management/admission-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/authorization/guards";
import { getStudentReferenceData } from "@/lib/student-management/data";

export default async function NewStudentPage() {
  await requirePermission("STUDENTS_MANAGE");
  const data = await getStudentReferenceData();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Secure admission"
        title="Admit a student"
        description="Create the learner profile, optional initial placement and first guardian in one audited transaction."
      />
      <Card>
        <CardHeader>
          <CardTitle>Admission record</CardTitle>
          <CardDescription>
            School and staff authority are derived from the selected server
            session; hidden IDs are never trusted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdmissionForm
            years={data.years}
            classes={data.classes}
            canOverrideCapacity={data.canOverrideCapacity}
            today={today}
          />
        </CardContent>
      </Card>
    </div>
  );
}
