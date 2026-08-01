import { ConfigurationList } from "@/components/academic-configuration/configuration-list";
import {
  ConfigurationReorderForm,
  SubjectEditForm,
} from "@/components/academic-configuration/entity-management-forms";
import { SubjectCreateForm } from "@/components/academic-configuration/quick-create-forms";
import { ConfigurationTransitionButton } from "@/components/academic-configuration/transition-button";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicConfigurationData } from "@/lib/academic-configuration/data";

export default async function SubjectsPage() {
  const data = await getAcademicConfigurationData();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Subject catalogue"
        title="Subjects"
        description="Configure subjects, aggregate behaviour, ordering, and historical availability."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ConfigurationList
          empty="No subjects have been configured."
          items={data.subjects.map((subject) => ({
            id: subject.id,
            title: `${subject.code} · ${subject.name}`,
            description: [
              subject.is_core ? "Core" : "Elective",
              subject.contributes_to_aggregate ? "Aggregate" : "Non-aggregate",
            ].join(" · "),
            status: subject.is_active ? "ACTIVE" : "INACTIVE",
            action: data.canManage ? (
              <ConfigurationTransitionButton
                id={subject.id}
                expectedUpdatedAt={subject.updated_at}
                label={subject.is_active ? "Deactivate" : "Activate"}
                transition={
                  subject.is_active ? "deactivate-subject" : "activate-subject"
                }
              />
            ) : undefined,
            editor: data.canManage ? (
              <SubjectEditForm
                subject={{
                  id: subject.id,
                  code: subject.code,
                  name: subject.name,
                  description: subject.description ?? "",
                  isCore: subject.is_core,
                  contributesToAggregate: subject.contributes_to_aggregate,
                  sortOrder: subject.sort_order,
                  updatedAt: subject.updated_at,
                }}
              />
            ) : undefined,
          }))}
        />
        {data.canManage ? (
          <div className="grid content-start gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Add subject</CardTitle>
              </CardHeader>
              <CardContent>
                <SubjectCreateForm />
              </CardContent>
            </Card>
            {data.subjects.filter((subject) => subject.is_active).length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Reorder active subjects</CardTitle>
                </CardHeader>
                <CardContent>
                  <ConfigurationReorderForm
                    kind="subjects"
                    items={data.subjects
                      .filter((subject) => subject.is_active)
                      .map((subject) => ({
                        id: subject.id,
                        label: `${subject.code} · ${subject.name}`,
                        updatedAt: subject.updated_at,
                      }))}
                  />
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
