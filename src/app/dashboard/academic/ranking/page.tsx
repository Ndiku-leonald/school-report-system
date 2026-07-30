import { ConfigurationList } from "@/components/academic-configuration/configuration-list";
import { RankingRuleForm } from "@/components/academic-configuration/rule-forms";
import { ConfigurationTransitionButton } from "@/components/academic-configuration/transition-button";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicConfigurationData } from "@/lib/academic-configuration/data";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default async function RankingPage() {
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
        eyebrow="Configuration only"
        title="Ranking rules"
        description="Maintain versioned ranking bases and supported tie options through a documented structured rule format. This stage does not calculate rankings."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <ConfigurationList
          empty="No ranking rules have been configured."
          items={data.ranking.map((rule) => {
            const configuration = record(rule.configuration);
            const isDraft = !rule.is_active && !rule.retired_at;
            const configuredMetric =
              configuration.configured_metric === "TOTAL" ||
              configuration.configured_metric === "AVERAGE" ||
              configuration.configured_metric === "AGGREGATE"
                ? configuration.configured_metric
                : "";
            const direction =
              configuration.direction === "ASC" ? "ASC" : "DESC";
            return {
              id: rule.id,
              title: `${rule.name} · v${rule.version}`,
              description: `${rule.ranking_basis} · ${rule.tie_method}`,
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
                      rule.is_active ? "deactivate-ranking" : "activate-ranking"
                    }
                  />
                ) : undefined,
              editor: data.canManage ? (
                <RankingRuleForm
                  mode={isDraft ? "edit" : "version"}
                  years={years}
                  grades={grades}
                  initial={{
                    id: rule.id,
                    updatedAt: rule.updated_at,
                    academicYearId: rule.academic_year_id ?? "",
                    gradeLevelId: rule.grade_level_id ?? "",
                    name: rule.name,
                    rankingBasis: rule.ranking_basis,
                    tieMethod: rule.tie_method,
                    direction,
                    includeIncomplete:
                      configuration.include_incomplete === true,
                    minimumSubjects:
                      typeof configuration.minimum_subjects === "number"
                        ? configuration.minimum_subjects
                        : "",
                    configuredMetric,
                  }}
                />
              ) : undefined,
            };
          })}
        />
        {data.canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>New ranking rule</CardTitle>
            </CardHeader>
            <CardContent>
              <RankingRuleForm years={years} grades={grades} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
