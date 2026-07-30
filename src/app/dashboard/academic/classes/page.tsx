import { ConfigurationList } from "@/components/academic-configuration/configuration-list";
import { ClassSectionEditForm } from "@/components/academic-configuration/entity-management-forms";
import { StructuredCreateForm } from "@/components/academic-configuration/structured-create-form";
import { ConfigurationTransitionButton } from "@/components/academic-configuration/transition-button";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicConfigurationData } from "@/lib/academic-configuration/data";

export default async function ClassSectionsPage() {
  const data = await getAcademicConfigurationData();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Year and grade scoped"
        title="Class sections"
        description="Review class sections while preserving the year and grade context used by historical records."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ConfigurationList
          empty="No class sections have been configured."
          items={data.classes.map((section) => ({
            id: section.id,
            title: `${section.class_code} · ${section.name}`,
            description: `${section.grade_levels.name} · ${section.academic_years.name}${section.capacity ? ` · Capacity ${section.capacity}` : ""}`,
            status: section.is_active ? "ACTIVE" : "INACTIVE",
            action: data.canManage ? (
              <ConfigurationTransitionButton
                id={section.id}
                expectedUpdatedAt={section.updated_at}
                label={section.is_active ? "Deactivate" : "Activate"}
                transition={
                  section.is_active ? "deactivate-class" : "activate-class"
                }
              />
            ) : undefined,
            editor:
              data.canManage &&
              (section.academic_years.status === "DRAFT" ||
                section.academic_years.status === "ACTIVE") ? (
                <ClassSectionEditForm
                  section={{
                    id: section.id,
                    academicYearId: section.academic_year_id,
                    gradeLevelId: section.grade_level_id,
                    name: section.name,
                    classCode: section.class_code,
                    capacity: section.capacity,
                    updatedAt: section.updated_at,
                  }}
                  scopeLocked={section.scope_locked}
                  years={data.years
                    .filter(
                      (year) =>
                        year.status === "DRAFT" || year.status === "ACTIVE",
                    )
                    .map((year) => ({ id: year.id, label: year.name }))}
                  grades={data.grades.map((grade) => ({
                    id: grade.id,
                    label: `${grade.code} · ${grade.name}`,
                  }))}
                />
              ) : undefined,
          }))}
        />
        {data.canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Add class section</CardTitle>
            </CardHeader>
            <CardContent>
              <StructuredCreateForm
                kind="class"
                years={data.years
                  .filter(
                    (year) =>
                      year.status === "DRAFT" || year.status === "ACTIVE",
                  )
                  .map((year) => ({ id: year.id, label: year.name }))}
                grades={data.grades.map((grade) => ({
                  id: grade.id,
                  label: `${grade.code} · ${grade.name}`,
                }))}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
