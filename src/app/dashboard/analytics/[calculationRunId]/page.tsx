import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  getAnalyticsAttention,
  getAnalyticsClasses,
  getAnalyticsDistributions,
  getAnalyticsGrade,
  getAnalyticsSubjects,
  getAnalyticsTopStudents,
} from "@/lib/analytics/data";
import {
  displayNumber,
  formatPercentage,
  rankingText,
} from "@/lib/analytics/format";
import { requirePermission } from "@/lib/authorization/guards";

function Distribution({
  title,
  rows,
  type,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof getAnalyticsDistributions>>;
  type: "OVERALL_GRADE" | "AGGREGATE_CLASSIFICATION";
}) {
  const items = rows.filter(
    (row) => row.distribution_type === type && row.label !== null,
  );
  const metadata = rows.find((row) => row.distribution_type === type);
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold">{title}</h3>
            <p className="text-muted-foreground mt-1 text-xs">
              {type === "OVERALL_GRADE"
                ? `Denominator: ${metadata?.distribution_population ?? 0} graded learners`
                : metadata?.classification_scale_present
                  ? `Denominator: ${metadata.distribution_population} classified learners`
                  : "No classification scale applied to this run"}
            </p>
          </div>
          <Badge variant="info">
            {items.reduce((sum, row) => sum + row.row_count, 0)}
          </Badge>
        </div>
        {items.length ? (
          <div className="mt-4 space-y-3">
            {items.map((row) => (
              <div key={`${type}-${row.label}`}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-medium">{row.label}</span>
                  <span className="font-mono">
                    {row.row_count} · {formatPercentage(row.percentage)}
                  </span>
                </div>
                <div
                  className="bg-surface-muted mt-1 h-2 rounded-full"
                  role="img"
                  aria-label={`${row.label}: ${row.row_count} learners, ${formatPercentage(row.percentage)}`}
                >
                  <div
                    className="bg-primary h-2 rounded-full"
                    style={{
                      width: `${Math.min(Math.max(row.percentage ?? 0, 0), 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground mt-4 text-sm">
            {type === "AGGREGATE_CLASSIFICATION" &&
            !metadata?.classification_scale_present
              ? "No classification scale. Classifications are not invented."
              : "No graded learners in this population."}
          </p>
        )}
        {type === "OVERALL_GRADE" ? (
          <p className="text-muted-foreground mt-4 text-xs">
            Ungraded: {metadata?.ungraded_count ?? 0}
          </p>
        ) : (
          <p className="text-muted-foreground mt-4 text-xs">
            Unclassified: {metadata?.unclassified_count ?? 0}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function AnalyticsGradePage({
  params,
}: {
  params: Promise<{ calculationRunId: string }>;
}) {
  const { calculationRunId } = await params;
  await requirePermission("ANALYTICS_VIEW");
  const grade = await getAnalyticsGrade(calculationRunId);
  if (!grade)
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Stage 16 · analytics unavailable"
          title="Calculation is not current"
          description="This scope is no longer the current authoritative Stage 11 result."
        />
        <Alert title="Analytics unavailable" variant="warning">
          The latest calculated results no longer match the current locked
          academic source. Recalculate results before reviewing this scope.
        </Alert>
        <Link
          href="/dashboard/results"
          className="text-primary font-semibold hover:underline"
        >
          Open results calculation workflow →
        </Link>
      </div>
    );
  const [classes, distributions, subjects, topStudents, attention] =
    await Promise.all([
      getAnalyticsClasses(calculationRunId),
      getAnalyticsDistributions(calculationRunId),
      getAnalyticsSubjects(calculationRunId),
      getAnalyticsTopStudents(calculationRunId),
      getAnalyticsAttention(calculationRunId),
    ]);
  const means = subjects
    .filter(
      (subject) => subject.complete_count > 0 && subject.mean_score !== null,
    )
    .map((subject) => subject.mean_score as number);
  const best = means.length ? Math.max(...means) : null;
  const weakest = means.length ? Math.min(...means) : null;
  const bestSubjects =
    best === null
      ? []
      : subjects.filter(
          (subject) =>
            subject.complete_count > 0 && subject.mean_score === best,
        );
  const weakestSubjects =
    weakest === null
      ? []
      : subjects.filter(
          (subject) =>
            subject.complete_count > 0 && subject.mean_score === weakest,
        );
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={`${grade.academic_year_name} · ${grade.term_name} · ${grade.grade_name}`}
        title="Grade analytics"
        description="Read-only metrics from the current authoritative Stage 11 calculation. This view reports results and attention indicators only."
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">Current authoritative</Badge>
            <Badge variant="info">Run v{grade.calculation_version}</Badge>
          </div>
        }
      />
      <Alert title="Coverage and source" variant="info">
        {grade.analytics_population} learners in this grade scope. Term state is
        LOCKED by the currentness check. Input checksum:{" "}
        <span className="font-mono">{grade.input_checksum.slice(0, 12)}</span> ·
        output:{" "}
        <span className="font-mono">{grade.output_checksum.slice(0, 12)}</span>.
      </Alert>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Learners", grade.analytics_population, "authoritative result rows"],
          [
            "Complete",
            grade.complete_count,
            `${grade.incomplete_count} incomplete`,
          ],
          [
            "Mean average",
            displayNumber(grade.mean_overall_average),
            `${grade.average_population_count} non-null averages`,
          ],
          [
            "Ranking eligible",
            grade.ranking_eligible_count,
            `${grade.graded_count} graded · ${grade.aggregate_classified_count} classified`,
          ],
        ].map(([label, value, note]) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <p className="text-muted-foreground text-sm">{label}</p>
              <p className="mt-2 font-mono text-2xl font-bold">{value}</p>
              <p className="text-muted-foreground mt-1 text-xs">{note}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <section
        className="grid gap-4 lg:grid-cols-2"
        aria-labelledby="distribution-heading"
      >
        <h2 id="distribution-heading" className="sr-only">
          Distributions
        </h2>
        <Distribution
          title="Overall grade distribution"
          rows={distributions}
          type="OVERALL_GRADE"
        />
        <Distribution
          title="Aggregate classification"
          rows={distributions}
          type="AGGREGATE_CLASSIFICATION"
        />
      </section>
      <section className="space-y-4" aria-labelledby="classes-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="classes-heading" className="text-xl font-bold">
              Class summaries
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Class totals reconcile to the grade population of{" "}
              {grade.analytics_population}.
            </p>
          </div>
          <div className="flex gap-2">
            <a
              className="text-primary text-sm font-semibold hover:underline"
              href={`/api/analytics/export?run=${calculationRunId}&type=summary`}
            >
              Download summary CSV
            </a>
            <a
              className="text-primary text-sm font-semibold hover:underline"
              href={`/api/analytics/export?run=${calculationRunId}&type=subjects`}
            >
              Subject CSV
            </a>
          </div>
        </div>
        <div className="border-border overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className="bg-surface-muted text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Learners</th>
                <th className="px-4 py-3">Complete</th>
                <th className="px-4 py-3">Incomplete</th>
                <th className="px-4 py-3">Mean / n</th>
                <th className="px-4 py-3">Rank eligible</th>
                <th className="px-4 py-3">Open</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {classes.map((item) => (
                <tr key={item.class_section_id}>
                  <td className="px-4 py-3 font-semibold">{item.class_name}</td>
                  <td className="px-4 py-3 font-mono">
                    {item.analytics_population}
                  </td>
                  <td className="px-4 py-3 font-mono">{item.complete_count}</td>
                  <td className="px-4 py-3 font-mono">
                    {item.incomplete_count}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {displayNumber(item.mean_overall_average)} /{" "}
                    {item.average_population_count}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {item.ranking_eligible_count}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      className="text-primary font-semibold hover:underline"
                      href={`/dashboard/analytics/${calculationRunId}/classes/${item.class_section_id}`}
                    >
                      View class
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="space-y-4" aria-labelledby="subject-heading">
        <div>
          <h2 id="subject-heading" className="text-xl font-bold">
            Subject performance
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Pass rate comes from Stage 11 is_pass output; exempted and
            incomplete subjects are not treated as failures.
          </p>
        </div>
        <div className="border-border overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-surface-muted text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Mean</th>
                <th className="px-4 py-3">Range</th>
                <th className="px-4 py-3">Pass rate</th>
                <th className="px-4 py-3">Complete / incomplete / exempted</th>
                <th className="px-4 py-3">Reading</th>
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
                  <td className="px-4 py-3">
                    {bestSubjects.some(
                      (subject) => subject.subject_id === item.subject_id,
                    ) ? (
                      <Badge variant="success">Strongest</Badge>
                    ) : weakestSubjects.some(
                        (subject) => subject.subject_id === item.subject_id,
                      ) ? (
                      <Badge variant="warning">Weakest</Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground text-xs">
          Strongest:{" "}
          {bestSubjects.length
            ? bestSubjects.map((subject) => subject.subject_name).join(", ")
            : "Not available"}
          . Weakest:{" "}
          {weakestSubjects.length
            ? weakestSubjects.map((subject) => subject.subject_name).join(", ")
            : "Not available"}
          .
        </p>
      </section>
      <section
        className="grid gap-4 xl:grid-cols-2"
        aria-labelledby="ranking-heading"
      >
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="ranking-heading" className="font-bold">
                  Top students
                </h2>
                <p className="text-muted-foreground mt-1 text-xs">
                  Stage 11 grade-level positions; ties crossing the cutoff
                  remain visible.
                </p>
              </div>
              <a
                className="text-primary text-sm font-semibold hover:underline"
                href={`/api/analytics/export?run=${calculationRunId}&type=distributions`}
              >
                Distribution CSV
              </a>
            </div>
            <div className="mt-4 space-y-2">
              {topStudents.length ? (
                topStudents.map((student) => (
                  <div
                    key={student.enrollment_id}
                    className="border-border flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <Link
                        href={`/dashboard/analytics/${calculationRunId}/students/${student.enrollment_id}`}
                        className="text-primary font-semibold hover:underline"
                      >
                        {student.student_name}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {student.class_name} · {student.overall_grade ?? "—"}
                      </p>
                    </div>
                    <p className="font-mono text-sm">
                      {rankingText(
                        student.rank_position,
                        student.is_tied,
                        student.tie_size,
                      )}{" "}
                      · {displayNumber(student.overall_average)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">
                  No eligible learners.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <h2 className="font-bold">Academic attention</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Factual completeness and subject concerns only; final academic
              decisions remain outside analytics.
            </p>
            <div className="mt-4 space-y-2">
              {attention.length ? (
                attention.map((student) => (
                  <div
                    key={student.enrollment_id}
                    className="border-border rounded-lg border p-3"
                  >
                    <Link
                      href={`/dashboard/analytics/${calculationRunId}/students/${student.enrollment_id}`}
                      className="text-primary font-semibold hover:underline"
                    >
                      {student.student_name}
                    </Link>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {student.attention_reason} ·{" "}
                      {student.failed_subject_count} failed complete subjects ·{" "}
                      {student.incomplete_subject_count} incomplete subjects
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">
                  No factual subject concerns in this scope.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
