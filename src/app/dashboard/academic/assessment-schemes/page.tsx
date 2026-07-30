import { AssessmentSchemeForm } from "@/components/academic-configuration/assessment-scheme-form";
import { ConfigurationList } from "@/components/academic-configuration/configuration-list";
import { ConfigurationTransitionButton } from "@/components/academic-configuration/transition-button";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicConfigurationData } from "@/lib/academic-configuration/data";

export default async function AssessmentSchemesPage() {
  const data = await getAcademicConfigurationData();
  const terms = data.terms.map((term) => ({
    id: term.id,
    label: `${term.academic_years.name} · ${term.name}`,
  }));
  const grades = data.grades.map((grade) => ({
    id: grade.id,
    label: grade.name,
  }));
  const subjects = data.subjects.map((subject) => ({
    id: subject.id,
    label: subject.name,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Version protected"
        title="Assessment schemes"
        description="Review structured assessment-component weights and immutable historical versions. Marks entry is intentionally outside this module."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <ConfigurationList
          empty="No assessment schemes have been configured."
          items={data.schemes.map((scheme) => ({
            id: scheme.id,
            title: `${scheme.name} · v${scheme.version}`,
            description: `${scheme.grade_levels.name} · ${scheme.subjects.name} · ${scheme.assessment_components.length} components`,
            status: scheme.status,
            action:
              data.canManage && scheme.status !== "RETIRED" ? (
                <ConfigurationTransitionButton
                  id={scheme.id}
                  expectedUpdatedAt={scheme.updated_at}
                  label={scheme.status === "DRAFT" ? "Activate" : "Retire"}
                  transition={
                    scheme.status === "DRAFT"
                      ? "activate-scheme"
                      : "retire-scheme"
                  }
                />
              ) : undefined,
            editor: data.canManage ? (
              <AssessmentSchemeForm
                mode={scheme.status === "DRAFT" ? "edit" : "version"}
                terms={terms}
                grades={grades}
                subjects={subjects}
                initial={{
                  id: scheme.id,
                  updatedAt: scheme.updated_at,
                  termId: scheme.term_id,
                  gradeLevelId: scheme.grade_level_id,
                  subjectId: scheme.subject_id,
                  name: scheme.name,
                  effectiveFrom: scheme.effective_from,
                  components: [...scheme.assessment_components]
                    .sort((left, right) => left.sort_order - right.sort_order)
                    .map((component) => ({
                      name: component.name,
                      componentCode: component.component_code,
                      maximumScore: component.maximum_score,
                      weightPercentage: component.weight_percentage,
                      sortOrder: component.sort_order,
                      isRequired: component.is_required,
                    })),
                }}
              />
            ) : undefined,
            meta: scheme.assessment_components
              .map(
                (component) =>
                  `${component.component_code} ${component.weight_percentage}%`,
              )
              .join(" · "),
          }))}
        />
        {data.canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>New assessment scheme</CardTitle>
            </CardHeader>
            <CardContent>
              <AssessmentSchemeForm
                terms={terms}
                grades={grades}
                subjects={subjects}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
