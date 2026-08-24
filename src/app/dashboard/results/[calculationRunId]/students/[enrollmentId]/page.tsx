import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCalculatedStudentDetail } from "@/lib/results-engine/data";

export default async function CalculatedStudentResultPage({
  params,
}: {
  params: Promise<{ calculationRunId: string; enrollmentId: string }>;
}) {
  const { calculationRunId, enrollmentId } = await params;
  const { run, detail, subjects, explanations } =
    await getCalculatedStudentDetail(calculationRunId, enrollmentId);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Calculation v${run.version}`}
        title={detail.student_name}
        description={`${detail.admission_number} · ${detail.class_name} · ${detail.term_name} · ${detail.grade_name}`}
        actions={
          <Badge variant={detail.ranking_eligible ? "success" : "warning"}>
            {detail.ranking_eligible
              ? "Ranking eligible"
              : "Not ranking eligible"}
          </Badge>
        }
      />
      <Card>
        <CardContent className="grid gap-5 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground text-xs uppercase">Total</p>
            <p className="font-mono text-xl font-bold">
              {detail.overall_total ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase">Average</p>
            <p className="font-mono text-xl font-bold">
              {detail.overall_average ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase">
              Overall grade
            </p>
            <p className="text-xl font-bold">{detail.overall_grade ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase">
              Aggregate / classification
            </p>
            <p className="text-xl font-bold">
              {detail.aggregate_total ?? "—"}
              {detail.aggregate_classification
                ? ` · ${detail.aggregate_classification}`
                : ""}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase">
              Class position
            </p>
            <p className="font-mono text-xl font-bold">
              {detail.class_position ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase">
              Grade position
            </p>
            <p className="font-mono text-xl font-bold">
              {detail.grade_level_position ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase">
              Completeness
            </p>
            <p className="font-semibold">
              {detail.is_complete ? "Complete" : "Incomplete"}
            </p>
          </div>
        </CardContent>
      </Card>
      <section className="space-y-3" aria-labelledby="subjects-heading">
        <h2
          id="subjects-heading"
          className="text-foreground text-lg font-bold tracking-tight"
        >
          Subject results
        </h2>
        <div className="border-border overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-surface-muted text-muted-foreground text-xs tracking-wide uppercase">
              <tr>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Grade</th>
                <th className="px-4 py-3">Aggregate</th>
                <th className="px-4 py-3">Pass</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Input flags</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {subjects.map((subject) => (
                <tr key={subject.subject_id}>
                  <td className="px-4 py-3 font-semibold">
                    {subject.subject_name}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {subject.subject_score ?? "—"}
                  </td>
                  <td className="px-4 py-3">{subject.grade ?? "—"}</td>
                  <td className="px-4 py-3">
                    {subject.aggregate_points ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {subject.is_pass === null
                      ? "—"
                      : subject.is_pass
                        ? "Pass"
                        : "Fail"}
                  </td>
                  <td className="px-4 py-3">
                    {subject.subject_position ?? "—"}
                    {subject.subject_is_tied ? (
                      <span className="text-muted-foreground ml-1 text-xs">
                        tie {subject.subject_tie_size}
                      </span>
                    ) : null}
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
                  <td className="px-4 py-3 text-xs">
                    {subject.has_absence ? "Absent component" : null}
                    {subject.has_absence && subject.has_exemption
                      ? " · "
                      : null}
                    {subject.has_exemption ? "Exemption" : null}
                    {!subject.has_absence && !subject.has_exemption
                      ? "—"
                      : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="space-y-3" aria-labelledby="trace-heading">
        <h2
          id="trace-heading"
          className="text-foreground text-lg font-bold tracking-tight"
        >
          Calculation explanation
        </h2>
        <p className="text-muted-foreground text-sm">
          ABSENT retains component weight with zero contribution; EXEMPTED and
          optional missing inputs remove weight; NOT_ASSESSED remains
          incomplete.
        </p>
        <div className="border-border overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-surface-muted text-muted-foreground text-xs tracking-wide uppercase">
              <tr>
                <th className="px-4 py-3">Subject / component</th>
                <th className="px-4 py-3">Attendance</th>
                <th className="px-4 py-3">Entered / max</th>
                <th className="px-4 py-3">Weight</th>
                <th className="px-4 py-3">Included</th>
                <th className="px-4 py-3">Contribution</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {explanations.map((item) => (
                <tr key={`${item.subject_id}-${item.component_name}`}>
                  <td className="px-4 py-3">
                    <span className="font-semibold">{item.subject_name}</span>
                    <span className="text-muted-foreground ml-1">
                      · {item.component_name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {item.attendance_status ?? "Missing"}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {item.entered_score ?? "—"} / {item.maximum_score}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {item.weight_percentage}%
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {item.included_weight}%
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {item.weighted_contribution}
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
