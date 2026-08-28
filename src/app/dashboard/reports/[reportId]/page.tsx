import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { ReportPreview } from "@/components/report-snapshots/report-preview";
import { Badge } from "@/components/ui/badge";
import {
  getGeneratedReport,
  getReportHistory,
  getReportSubjects,
} from "@/lib/report-snapshots/data";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const report = await getGeneratedReport(reportId);
  const [subjects, history] = await Promise.all([
    getReportSubjects(reportId),
    getReportHistory(
      report.snapshot_data.placement.enrollment_id,
      report.snapshot_data.academic_period.term_id,
    ),
  ]);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Report snapshot v${report.report_version}`}
        title={report.snapshot_data.student.display_name}
        description={`${report.snapshot_data.student.admission_number} · ${report.snapshot_data.placement.class_name} · ${report.snapshot_data.academic_period.term_name}`}
        actions={
          <Badge variant={report.superseded_by ? "neutral" : "success"}>
            {report.superseded_by ? "Historical" : "Current"}
          </Badge>
        }
      />
      <p className="text-muted-foreground text-sm">
        <Link
          href="/dashboard/reports"
          className="text-primary font-semibold hover:underline"
        >
          Back to reports
        </Link>
      </p>
      <ReportPreview report={report} subjects={subjects} history={history} />
    </div>
  );
}
