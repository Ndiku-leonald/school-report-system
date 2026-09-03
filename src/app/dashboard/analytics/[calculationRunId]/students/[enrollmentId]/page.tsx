import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/lib/authorization/guards";
import { getAnalyticsStudent } from "@/lib/analytics/data";
import { displayNumber, rankingText } from "@/lib/analytics/format";

export default async function AnalyticsStudentPage({
  params,
}: {
  params: Promise<{ calculationRunId: string; enrollmentId: string }>;
}) {
  const { calculationRunId, enrollmentId } = await params;
  await requirePermission("ANALYTICS_VIEW");
  const data = await getAnalyticsStudent(calculationRunId, enrollmentId);
  if (!data)
    return (
      <div className="space-y-6">
        <PageHeader
          title="Student analytics unavailable"
          description="This academic result is not available in the current authoritative run."
        />
        <Alert title="Not found" variant="warning">
          The result may be stale, outside the selected school, or unavailable
          to the current analytics reader.
        </Alert>
      </div>
    );
  const { student, subjects } = data;
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={`${student.academic_year_name} · ${student.term_name} · ${student.grade_name}`}
        title={student.student_name}
        description={`${student.admission_number} · ${student.class_name} · calculation version ${student.calculation_version}`}
        actions={
          <Badge variant={student.is_complete ? "success" : "warning"}>
            {student.is_complete ? "Complete result" : "Incomplete result"}
          </Badge>
        }
      />
      <Alert title="Confidential academic data">
        This drill-down contains academic values only. Guardian information,
        parent credentials, date of birth, photos, report paths, and publication
        data are intentionally absent.
      </Alert>
      <Card>
        <CardContent className="grid gap-5 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Overall total", displayNumber(student.overall_total)],
            ["Overall average", displayNumber(student.overall_average)],
            ["Overall grade", student.overall_grade ?? "—"],
            [
              "Aggregate",
              student.aggregate_classification
                ? `${displayNumber(student.aggregate_total)} · ${student.aggregate_classification}`
                : displayNumber(student.aggregate_total),
            ],
            [
              "Class position",
              rankingText(
                student.class_position,
                student.class_is_tied,
                student.class_tie_size,
              ),
            ],
            [
              "Grade position",
              rankingText(
                student.grade_level_position,
                student.grade_level_is_tied,
                student.grade_level_tie_size,
              ),
            ],
            ["Ranking", student.ranking_eligible ? "Eligible" : "Not eligible"],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-muted-foreground text-sm">{label}</p>
              <p className="mt-1 font-semibold">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <section className="space-y-3" aria-labelledby="student-subjects-heading">
        <div>
          <h2 id="student-subjects-heading" className="text-xl font-bold">
            Subject results
          </h2>
          <p className="text-muted-foreground text-sm">
            Stage 11 status semantics are preserved: COMPLETE, INCOMPLETE, and
            EXEMPTED. Exemption is not failure.
          </p>
        </div>
        <div className="border-border overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="bg-surface-muted text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Score / grade</th>
                <th className="px-4 py-3">Pass</th>
                <th className="px-4 py-3">Aggregate</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Input flags</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {subjects.map((subject) => (
                <tr key={subject.subject_id}>
                  <td className="px-4 py-3 font-semibold">
                    {subject.subject_name}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        subject.subject_status === "COMPLETE"
                          ? "success"
                          : subject.subject_status === "EXEMPTED"
                            ? "info"
                            : "warning"
                      }
                    >
                      {subject.subject_status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {displayNumber(subject.subject_score)} /{" "}
                    {subject.grade ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {subject.is_pass === null
                      ? "—"
                      : subject.is_pass
                        ? "Pass"
                        : "Fail"}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {displayNumber(subject.aggregate_points)}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {rankingText(
                      subject.subject_position,
                      subject.subject_is_tied,
                      subject.subject_tie_size,
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {subject.has_absence ? "Absent component" : ""}
                    {subject.has_absence && subject.has_exemption ? " · " : ""}
                    {subject.has_exemption ? "Exemption" : ""}
                    {!subject.has_absence && !subject.has_exemption ? "—" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
