import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { ReportGenerationCard } from "@/components/report-snapshots/report-generation-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  canGenerateReports,
  getGeneratedReports,
  getReportGenerationReadiness,
} from "@/lib/report-snapshots/data";
import { getResultCalculationTerms } from "@/lib/results-engine/data";

export default async function ReportsPage() {
  const [canGenerate, terms, reports] = await Promise.all([
    canGenerateReports(),
    getResultCalculationTerms(),
    getGeneratedReports(),
  ]);
  const runs = terms.filter((term) => term.latest_run_id);
  const readiness = (
    await Promise.all(
      runs.map((term) => getReportGenerationReadiness(term.latest_run_id!)),
    )
  ).filter((item) => item !== null);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Immutable report snapshots"
        title="Reports"
        description="Prepare student-specific HTML report snapshots from locked Stage 11 results. Every generated version preserves its source data for later rendering."
        actions={<Badge variant="info">Stage 12 · no PDF</Badge>}
      />
      <section className="space-y-4" aria-labelledby="preparation-heading">
        <div>
          <h2
            id="preparation-heading"
            className="text-foreground text-lg font-bold tracking-tight"
          >
            Report preparation
          </h2>
          <p className="text-muted-foreground text-sm">
            Only authoritative calculation runs for the selected school are
            shown.
          </p>
        </div>
        {readiness.length ? (
          readiness.map((item) => (
            <ReportGenerationCard
              key={item!.calculation_run_id}
              readiness={item!}
              canGenerate={canGenerate}
            />
          ))
        ) : (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="font-semibold">
                No finalized calculation runs yet.
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                Lock marks and calculate results before preparing report
                snapshots.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
      <section className="space-y-4" aria-labelledby="generated-heading">
        <div>
          <h2
            id="generated-heading"
            className="text-foreground text-lg font-bold tracking-tight"
          >
            Generated reports
          </h2>
          <p className="text-muted-foreground text-sm">
            Historical versions remain available; current records are marked
            latest.
          </p>
        </div>
        {reports.length ? (
          <div className="border-border overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-surface-muted text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Versions</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {reports.map((report) => (
                  <tr key={report.report_id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/reports/${report.report_id}`}
                        className="text-primary font-semibold hover:underline"
                      >
                        {report.student_name}
                      </Link>
                      <span className="text-muted-foreground ml-2 font-mono text-xs">
                        {report.admission_number}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {report.academic_year_name} · {report.term_name}
                    </td>
                    <td className="px-4 py-3">
                      {report.grade_name} · {report.class_name}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      v{report.report_version} · calc v
                      {report.calculation_version}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={report.is_latest ? "success" : "neutral"}>
                        {report.is_latest ? "Current" : "Historical"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-muted-foreground text-sm">
                No report snapshots have been generated in this school.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
