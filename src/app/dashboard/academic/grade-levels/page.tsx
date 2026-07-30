import { ConfigurationList } from "@/components/academic-configuration/configuration-list";
import { GradeLevelCreateForm } from "@/components/academic-configuration/quick-create-forms";
import { ConfigurationTransitionButton } from "@/components/academic-configuration/transition-button";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicConfigurationData } from "@/lib/academic-configuration/data";

export default async function GradeLevelsPage() {
  const data = await getAcademicConfigurationData();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="School pathway"
        title="Grade levels"
        description="Maintain ordered, configurable grade levels without hard-coded class names."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ConfigurationList
          empty="No grade levels have been configured."
          items={data.grades.map((grade) => ({
            id: grade.id,
            title: `${grade.code} · ${grade.name}`,
            description: `Display order ${grade.sort_order}${grade.is_final_grade ? " · Final grade" : ""}`,
            status: grade.is_active ? "ACTIVE" : "INACTIVE",
            action: data.canManage ? (
              <ConfigurationTransitionButton
                id={grade.id}
                expectedUpdatedAt={grade.updated_at}
                label={grade.is_active ? "Deactivate" : "Activate"}
                transition={
                  grade.is_active ? "deactivate-grade" : "activate-grade"
                }
              />
            ) : undefined,
          }))}
        />
        {data.canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Add grade level</CardTitle>
            </CardHeader>
            <CardContent>
              <GradeLevelCreateForm />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
