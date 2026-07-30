import { ConfigurationList } from "@/components/academic-configuration/configuration-list";
import { StructuredCreateForm } from "@/components/academic-configuration/structured-create-form";
import { ConfigurationTransitionButton } from "@/components/academic-configuration/transition-button";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicConfigurationData } from "@/lib/academic-configuration/data";

export default async function PromotionPage() {
  const data = await getAcademicConfigurationData();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Rules, not decisions"
        title="Promotion rules"
        description="Maintain reviewed threshold versions without calculating recommendations or changing learner progression."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <ConfigurationList
          empty="No promotion rules have been configured."
          items={data.promotion.map((rule) => ({
            id: rule.id,
            title: `${rule.name} · v${rule.version}`,
            description:
              [
                rule.minimum_average === null
                  ? null
                  : `Average ≥ ${rule.minimum_average}%`,
                rule.minimum_subjects_passed === null
                  ? null
                  : `${rule.minimum_subjects_passed} subjects passed`,
                rule.minimum_attendance_percentage === null
                  ? null
                  : `Attendance ≥ ${rule.minimum_attendance_percentage}%`,
              ]
                .filter(Boolean)
                .join(" · ") || "No numeric thresholds",
            status: rule.is_active
              ? "ACTIVE"
              : rule.retired_at
                ? "RETIRED"
                : "DRAFT",
            action:
              data.canManage && !rule.retired_at ? (
                <ConfigurationTransitionButton
                  id={rule.id}
                  expectedUpdatedAt={rule.updated_at}
                  label={rule.is_active ? "Retire" : "Activate"}
                  transition={
                    rule.is_active
                      ? "deactivate-promotion"
                      : "activate-promotion"
                  }
                />
              ) : undefined,
          }))}
        />
        {data.canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>New promotion rule</CardTitle>
            </CardHeader>
            <CardContent>
              <StructuredCreateForm
                kind="promotion"
                years={data.years.map((year) => ({
                  id: year.id,
                  label: year.name,
                }))}
                grades={data.grades.map((grade) => ({
                  id: grade.id,
                  label: grade.name,
                }))}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
