import { ClassificationForm } from "@/components/results-engine/classification-form";
import { ClassificationScaleActions } from "@/components/results-engine/classification-scale-actions";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicConfigurationData } from "@/lib/academic-configuration/data";
import { getAggregateClassificationScales } from "@/lib/results-engine/data";

export default async function AggregateClassificationsPage() {
  const [configuration, scales] = await Promise.all([
    getAcademicConfigurationData(),
    getAggregateClassificationScales(),
  ]);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Optional aggregate mapping"
        title="Aggregate classifications"
        description="Configure versioned school-scoped aggregate labels such as divisions without hard-coding their ranges into the calculation engine."
        actions={
          <Badge variant={configuration.canManage ? "success" : "info"}>
            {configuration.canManage ? "Management access" : "View access"}
          </Badge>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          {scales.map((scale) => (
            <Card key={scale.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      {scale.name} · v{scale.version}
                    </CardTitle>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {scale.academic_year_id ? "Year scoped" : "All years"} ·{" "}
                      {scale.grade_level_id ? "Grade scoped" : "All grades"}
                    </p>
                  </div>
                  <Badge
                    variant={
                      scale.is_active
                        ? "success"
                        : scale.retired_at
                          ? "neutral"
                          : "warning"
                    }
                  >
                    {scale.is_active
                      ? "ACTIVE"
                      : scale.retired_at
                        ? "RETIRED"
                        : "DRAFT"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="divide-border divide-y text-sm">
                  {scale.bands.map((band) => (
                    <li
                      key={band.id}
                      className="flex justify-between gap-3 py-2"
                    >
                      <span>{band.label}</span>
                      <span className="font-mono">
                        {band.minimumAggregate}–{band.maximumAggregate}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground mt-3 text-xs">
                  Draft editing and activation use narrow audited RPCs; active
                  and retired versions remain immutable.
                </p>
                <ClassificationScaleActions
                  scale={scale}
                  canManage={configuration.canManage}
                />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Create draft</CardTitle>
          </CardHeader>
          <CardContent>
            <ClassificationForm
              years={configuration.years.map((year) => ({
                id: year.id,
                label: year.name,
              }))}
              grades={configuration.grades.map((grade) => ({
                id: grade.id,
                label: grade.name,
              }))}
              canManage={configuration.canManage}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
