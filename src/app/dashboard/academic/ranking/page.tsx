import { ConfigurationList } from "@/components/academic-configuration/configuration-list";
import { StructuredCreateForm } from "@/components/academic-configuration/structured-create-form";
import { ConfigurationTransitionButton } from "@/components/academic-configuration/transition-button";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicConfigurationData } from "@/lib/academic-configuration/data";

export default async function RankingPage() {
  const data = await getAcademicConfigurationData();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Configuration only"
        title="Ranking rules"
        description="Maintain versioned ranking bases and tie methods. This stage does not calculate rankings."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <ConfigurationList
          empty="No ranking rules have been configured."
          items={data.ranking.map((rule) => ({
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
          }))}
        />
        {data.canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>New ranking rule</CardTitle>
            </CardHeader>
            <CardContent>
              <StructuredCreateForm
                kind="ranking"
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
