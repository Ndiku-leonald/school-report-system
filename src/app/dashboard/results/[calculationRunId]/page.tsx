import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthorizationContext } from "@/lib/authorization/context";
import {
  getCalculatedStudents,
  getGradeSubjectPerformance,
  getResultCalculationRun,
  getSubjectPerformance,
} from "@/lib/results-engine/data";

export default async function ResultCalculationRunPage({
  params,
}: {
  params: Promise<{ calculationRunId: string }>;
}) {
  const { calculationRunId } = await params;
  const [run, students, performance, gradePerformance, context] =
    await Promise.all([
      getResultCalculationRun(calculationRunId),
      getCalculatedStudents(calculationRunId),
      getSubjectPerformance(calculationRunId),
      getGradeSubjectPerformance(calculationRunId),
      getAuthorizationContext(),
    ]);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Immutable calculation run"
        title={`${run.term_name} · ${run.grade_name}`}
        description={`Version ${run.version} calculated ${new Date(run.created_at).toLocaleString()}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {context.permissions.has("REPORTS_GENERATE") ? (
              <Link
                href="/dashboard/reports"
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold"
              >
                Prepare reports
              </Link>
            ) : null}
            <Badge variant="success">Run v{run.version}</Badge>
          </div>
        }
      />
      <Card>
        <CardContent className="grid gap-5 pt-6 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-muted-foreground text-xs uppercase">Grading</p>
            <p className="font-semibold">
              {run.grading_scale_name} · v{run.grading_scale_version}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase">Ranking</p>
            <p className="font-semibold">
              {run.ranking_rule_name} · v{run.ranking_rule_version}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase">
              Classification
            </p>
            <p className="font-semibold">
              {run.classification_scale_name
                ? `${run.classification_scale_name} · v${run.classification_scale_version}`
                : "Not selected"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase">
              Sources / students
            </p>
            <p className="font-mono font-semibold">
              {run.source_sheet_count} / {run.student_count}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-muted-foreground text-xs uppercase">
              Input checksum
            </p>
            <p className="font-mono text-xs break-all">{run.input_checksum}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-muted-foreground text-xs uppercase">
              Output checksum
            </p>
            <p className="font-mono text-xs break-all">{run.output_checksum}</p>
          </div>
        </CardContent>
      </Card>
      {run.supersedes_run_id ? (
        <p className="text-muted-foreground text-sm">
          Supersedes{" "}
          <Link
            className="text-primary font-semibold hover:underline"
            href={`/dashboard/results/${run.supersedes_run_id}`}
          >
            a previous calculation run
          </Link>
          .
        </p>
      ) : null}
      <section className="space-y-3" aria-labelledby="students-heading">
        <div>
          <h2
            id="students-heading"
            className="text-foreground text-lg font-bold tracking-tight"
          >
            Student results
          </h2>
          <p className="text-muted-foreground text-sm">
            Academic values only. Guardian contacts, PDFs, publication, and
            promotion controls are intentionally absent.
          </p>
        </div>
        <div className="border-border overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-surface-muted text-muted-foreground text-xs tracking-wide uppercase">
              <tr>
                <th className="px-4 py-3">Admission</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Average</th>
                <th className="px-4 py-3">Grade</th>
                <th className="px-4 py-3">Aggregate / classification</th>
                <th className="px-4 py-3">Positions</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {students.map((student) => (
                <tr key={student.enrollment_id}>
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      className="text-primary font-semibold hover:underline"
                      href={`/dashboard/results/${calculationRunId}/students/${student.enrollment_id}`}
                    >
                      {student.admission_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {student.student_name}
                  </td>
                  <td className="px-4 py-3">{student.class_name}</td>
                  <td className="px-4 py-3 font-mono">
                    {student.overall_total ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {student.overall_average ?? "—"}
                  </td>
                  <td className="px-4 py-3">{student.overall_grade ?? "—"}</td>
                  <td className="px-4 py-3">
                    {student.aggregate_total ?? "—"}
                    {student.aggregate_classification
                      ? ` · ${student.aggregate_classification}`
                      : ""}
                  </td>
                  <td className="px-4 py-3">
                    {student.class_position ?? "—"} /{" "}
                    {student.grade_level_position ?? "—"}
                    {student.class_is_tied || student.grade_level_is_tied ? (
                      <span className="text-muted-foreground ml-1 text-xs">
                        tied
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="space-y-3" aria-labelledby="performance-heading">
        <div>
          <h2
            id="performance-heading"
            className="text-foreground text-lg font-bold tracking-tight"
          >
            Subject performance review
          </h2>
          <p className="text-muted-foreground text-sm">
            Calculation-review summaries by class and subject, not the later
            analytics dashboard.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {performance.map((item) => (
            <Card key={`${item.class_section_id}-${item.subject_id}`}>
              <CardHeader>
                <CardTitle className="text-base">
                  {item.subject_name} · {item.class_name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Mean</dt>
                    <dd className="font-mono">{item.mean_score ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Range</dt>
                    <dd className="font-mono">
                      {item.minimum_score ?? "—"} – {item.maximum_score ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Pass rate</dt>
                    <dd className="font-mono">{item.pass_rate ?? "—"}%</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Complete / incomplete / exempted
                    </dt>
                    <dd className="font-mono">
                      {item.complete_count} / {item.incomplete_count} /{" "}
                      {item.exempted_count}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <section
        className="space-y-3"
        aria-labelledby="grade-performance-heading"
      >
        <div>
          <h2
            id="grade-performance-heading"
            className="text-foreground text-lg font-bold tracking-tight"
          >
            Grade-wide subject performance
          </h2>
          <p className="text-muted-foreground text-sm">
            All classes in this calculation scope, preserved as immutable
            academic summaries.
          </p>
        </div>
        <div className="border-border overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-surface-muted text-muted-foreground text-xs tracking-wide uppercase">
              <tr>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Mean</th>
                <th className="px-4 py-3">Range</th>
                <th className="px-4 py-3">Pass rate</th>
                <th className="px-4 py-3">Complete / incomplete / exempted</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {gradePerformance.map((item) => (
                <tr key={item.subject_id}>
                  <td className="px-4 py-3 font-semibold">
                    {item.subject_name}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {item.mean_score ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {item.minimum_score ?? "—"} – {item.maximum_score ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {item.pass_rate ?? "—"}%
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
    </div>
  );
}
