import { ConfigurationList } from "@/components/academic-configuration/configuration-list";
import { PromotionRuleForm } from "@/components/academic-configuration/rule-forms";
import { ConfigurationTransitionButton } from "@/components/academic-configuration/transition-button";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicConfigurationData } from "@/lib/academic-configuration/data";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredSubjectRules(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const rule = record(item);
    return typeof rule.subject_id === "string" &&
      typeof rule.minimum_score === "number"
      ? [{ subjectId: rule.subject_id, minimumScore: rule.minimum_score }]
      : [];
  });
}

export default async function PromotionPage() {
  const data = await getAcademicConfigurationData();
  const years = data.years.map((year) => ({
    id: year.id,
    label: year.name,
  }));
  const grades = data.grades.map((grade) => ({
    id: grade.id,
    label: grade.name,
  }));
  const subjects = data.subjects.map((subject) => ({
    id: subject.id,
    label: `${subject.code} · ${subject.name}`,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Rules, not decisions"
        title="Promotion rules"
        description="Maintain reviewed threshold versions and same-school required-subject rules without calculating recommendations or changing learner progression."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <ConfigurationList
          empty="No promotion rules have been configured."
          items={data.promotion.map((rule) => {
            const additional = record(rule.additional_rules);
            const isDraft = !rule.is_active && !rule.retired_at;
            return {
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
              editor: data.canManage ? (
                <PromotionRuleForm
                  mode={isDraft ? "edit" : "version"}
                  years={years}
                  grades={grades}
                  subjects={subjects}
                  initial={{
                    id: rule.id,
                    updatedAt: rule.updated_at,
                    academicYearId: rule.academic_year_id ?? "",
                    gradeLevelId: rule.grade_level_id ?? "",
                    name: rule.name,
                    minimumAverage: rule.minimum_average ?? "",
                    maximumAggregate: rule.maximum_aggregate ?? "",
                    minimumSubjectsPassed: rule.minimum_subjects_passed ?? "",
                    minimumAttendancePercentage:
                      rule.minimum_attendance_percentage ?? "",
                    requiredSubjectRules: requiredSubjectRules(
                      rule.required_subject_rules,
                    ),
                    requireAllRequiredSubjects:
                      additional.require_all_required_subjects !== false,
                    allowManualReview: additional.allow_manual_review !== false,
                  }}
                />
              ) : undefined,
            };
          })}
        />
        {data.canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>New promotion rule</CardTitle>
            </CardHeader>
            <CardContent>
              <PromotionRuleForm
                years={years}
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
