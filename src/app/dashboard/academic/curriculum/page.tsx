import { ConfigurationList } from "@/components/academic-configuration/configuration-list";
import { CurriculumMappingEditForm } from "@/components/academic-configuration/entity-management-forms";
import { StructuredCreateForm } from "@/components/academic-configuration/structured-create-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicConfigurationData } from "@/lib/academic-configuration/data";

export default async function CurriculumPage() {
  const data = await getAcademicConfigurationData();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Grade-subject mapping"
        title="Curriculum"
        description="Review required and aggregate-contributing subjects in each grade level."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ConfigurationList
          empty="No grade-to-subject mappings have been configured."
          items={data.curriculum.map((mapping) => ({
            id: mapping.id,
            title: `${mapping.grade_levels.code} · ${mapping.subjects.name}`,
            description: `Order ${mapping.sort_order} · ${mapping.is_required ? "Required" : "Optional"} · ${mapping.contributes_to_aggregate ? "Aggregate" : "Non-aggregate"}`,
            status: "MAPPED",
            editor: data.canManage ? (
              <CurriculumMappingEditForm
                mapping={{
                  id: mapping.id,
                  pairLabel: `${mapping.grade_levels.name} · ${mapping.subjects.name}`,
                  isRequired: mapping.is_required,
                  contributesToAggregate: mapping.contributes_to_aggregate,
                  sortOrder: mapping.sort_order,
                  updatedAt: mapping.updated_at,
                  inUse: mapping.in_use,
                }}
              />
            ) : undefined,
          }))}
        />
        {data.canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Map subject</CardTitle>
            </CardHeader>
            <CardContent>
              <StructuredCreateForm
                kind="curriculum"
                grades={data.grades
                  .filter((grade) => grade.is_active)
                  .map((grade) => ({
                    id: grade.id,
                    label: `${grade.code} · ${grade.name}`,
                  }))}
                subjects={data.subjects
                  .filter((subject) => subject.is_active)
                  .map((subject) => ({
                    id: subject.id,
                    label: `${subject.code} · ${subject.name}`,
                  }))}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
