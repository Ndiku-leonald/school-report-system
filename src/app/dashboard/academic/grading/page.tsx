import { ConfigurationList } from "@/components/academic-configuration/configuration-list";
import { StructuredCreateForm } from "@/components/academic-configuration/structured-create-form";
import { ConfigurationTransitionButton } from "@/components/academic-configuration/transition-button";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicConfigurationData } from "@/lib/academic-configuration/data";

export default async function GradingPage() {
  const data = await getAcademicConfigurationData();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="0–100 coverage"
        title="Grading scales"
        description="Review continuous, non-overlapping grading bands and immutable active versions."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <ConfigurationList
          empty="No grading scales have been configured."
          items={data.grading.map((scale) => ({
            id: scale.id,
            title: `${scale.name} · v${scale.version}`,
            description: `${scale.grading_bands.length} bands · Effective ${scale.effective_from}`,
            status: scale.is_active
              ? "ACTIVE"
              : scale.retired_at
                ? "RETIRED"
                : "DRAFT",
            action:
              data.canManage && !scale.retired_at ? (
                <ConfigurationTransitionButton
                  id={scale.id}
                  expectedUpdatedAt={scale.updated_at}
                  label={scale.is_active ? "Retire" : "Activate"}
                  transition={
                    scale.is_active ? "deactivate-scale" : "activate-scale"
                  }
                />
              ) : undefined,
            meta: scale.grading_bands
              .map(
                (band) =>
                  `${band.grade}: ${band.minimum_score}–${band.maximum_score}`,
              )
              .join(" · "),
          }))}
        />
        {data.canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>New grading scale</CardTitle>
            </CardHeader>
            <CardContent>
              <StructuredCreateForm
                kind="grading"
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
