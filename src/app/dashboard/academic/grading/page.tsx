import { ConfigurationList } from "@/components/academic-configuration/configuration-list";
import { GradingScaleForm } from "@/components/academic-configuration/grading-scale-form";
import { ConfigurationTransitionButton } from "@/components/academic-configuration/transition-button";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicConfigurationData } from "@/lib/academic-configuration/data";

export default async function GradingPage() {
  const data = await getAcademicConfigurationData();
  const years = data.years.map((year) => ({
    id: year.id,
    label: year.name,
  }));
  const grades = data.grades.map((grade) => ({
    id: grade.id,
    label: grade.name,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="0–100 coverage"
        title="Grading scales"
        description="Edit grading bands through structured controls, verify coverage, and preserve immutable historical versions."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <ConfigurationList
          empty="No grading scales have been configured."
          items={data.grading.map((scale) => {
            const isDraft = !scale.is_active && !scale.retired_at;
            return {
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
              editor: data.canManage ? (
                <GradingScaleForm
                  mode={isDraft ? "edit" : "version"}
                  years={years}
                  grades={grades}
                  initial={{
                    id: scale.id,
                    updatedAt: scale.updated_at,
                    academicYearId: scale.academic_year_id ?? "",
                    gradeLevelId: scale.grade_level_id ?? "",
                    name: scale.name,
                    effectiveFrom: scale.effective_from,
                    bands: [...scale.grading_bands]
                      .sort((left, right) => left.sort_order - right.sort_order)
                      .map((band) => ({
                        minimumScore: band.minimum_score,
                        maximumScore: band.maximum_score,
                        grade: band.grade,
                        aggregatePoints: band.aggregate_points ?? "",
                        description: band.description ?? "",
                        isPass: band.is_pass,
                        sortOrder: band.sort_order,
                      })),
                  }}
                />
              ) : undefined,
              meta: scale.grading_bands
                .map(
                  (band) =>
                    `${band.grade}: ${band.minimum_score}–${band.maximum_score}`,
                )
                .join(" · "),
            };
          })}
        />
        {data.canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>New grading scale</CardTitle>
            </CardHeader>
            <CardContent>
              <GradingScaleForm years={years} grades={grades} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
