import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  getAnalyticsAttention,
  getAnalyticsClass,
  getAnalyticsDistributions,
  getAnalyticsSubjects,
  getAnalyticsTopStudents,
} from "@/lib/analytics/data";
import {
  displayNumber,
  formatPercentage,
  rankingText,
} from "@/lib/analytics/format";
import { requirePermission } from "@/lib/authorization/guards";

export default async function AnalyticsClassPage({
  params,
}: {
  params: Promise<{ calculationRunId: string; classSectionId: string }>;
}) {
  const { calculationRunId, classSectionId } = await params;
  await requirePermission("ANALYTICS_VIEW");
  const summary = await getAnalyticsClass(calculationRunId, classSectionId);
  if (!summary)
    return (
      <div className="space-y-6">
        <PageHeader
          title="Class analytics unavailable"
          description="This class is not part of the current authoritative calculation scope."
        />
        <Alert title="Analytics unavailable" variant="warning">
          The run may be stale, the class may belong to another school, or the
          selected membership may no longer be authorized.
        </Alert>
      </div>
    );
  const [subjects, distributions, top, attention] = await Promise.all([
    getAnalyticsSubjects(calculationRunId, classSectionId),
    getAnalyticsDistributions(calculationRunId, classSectionId),
    getAnalyticsTopStudents(calculationRunId, classSectionId),
    getAnalyticsAttention(calculationRunId, classSectionId),
  ]);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Class analytics · current authoritative run"
        title={summary.class_name}
        description="Class-level academic performance derived from immutable Stage 11 subject and student results."
        actions={<Badge variant="success">Read-only</Badge>}
      />
      <Alert title="Academic attention" variant="info">
        Attention indicators describe incomplete results and failed complete
        subjects. They do not make advancement decisions.
      </Alert>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Learners", summary.analytics_population],
          ["Complete", summary.complete_count],
          ["Mean average", displayNumber(summary.mean_overall_average)],
          ["Rank eligible", summary.ranking_eligible_count],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <p className="text-muted-foreground text-sm">{label}</p>
              <p className="mt-2 font-mono text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Class subjects</h2>
        <div className="border-border overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-surface-muted text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Mean</th>
                <th className="px-4 py-3">Range</th>
                <th className="px-4 py-3">Pass rate</th>
                <th className="px-4 py-3">Complete / incomplete / exempted</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {subjects.map((item) => (
                <tr key={item.subject_id}>
                  <td className="px-4 py-3 font-semibold">
                    {item.subject_name}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {displayNumber(item.mean_score)}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {displayNumber(item.minimum_score)} –{" "}
                    {displayNumber(item.maximum_score)}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {formatPercentage(item.pass_rate)}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {item.complete_count} / {item.incomplete_count} /{" "}
                    {item.exempted_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-5">
            <h2 className="font-bold">Class distribution</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Grade distribution denominator:{" "}
              {distributions.find(
                (row) => row.distribution_type === "OVERALL_GRADE",
              )?.distribution_population ?? 0}{" "}
              graded learners.
            </p>
            <div className="mt-3 space-y-2">
              {distributions
                .filter(
                  (row) =>
                    row.distribution_type === "OVERALL_GRADE" && row.label,
                )
                .map((row) => (
                  <p key={row.label} className="flex justify-between text-sm">
                    <span>{row.label}</span>
                    <span className="font-mono">
                      {row.row_count} · {formatPercentage(row.percentage)}
                    </span>
                  </p>
                ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <h2 className="font-bold">Top class learners</h2>
            <div className="mt-3 space-y-2">
              {top.length ? (
                top.map((student) => (
                  <p
                    key={student.enrollment_id}
                    className="flex justify-between gap-3 text-sm"
                  >
                    <Link
                      className="text-primary font-semibold hover:underline"
                      href={`/dashboard/analytics/${calculationRunId}/students/${student.enrollment_id}`}
                    >
                      {student.student_name}
                    </Link>
                    <span className="font-mono">
                      {rankingText(
                        student.rank_position,
                        student.is_tied,
                        student.tie_size,
                      )}
                    </span>
                  </p>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">
                  No eligible learners.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Academic attention</h2>
        {attention.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {attention.map((student) => (
              <Card key={student.enrollment_id}>
                <CardContent className="pt-5">
                  <Link
                    href={`/dashboard/analytics/${calculationRunId}/students/${student.enrollment_id}`}
                    className="text-primary font-semibold hover:underline"
                  >
                    {student.student_name}
                  </Link>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {student.attention_reason}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No factual subject concerns in this class.
          </p>
        )}
      </section>
    </div>
  );
}
