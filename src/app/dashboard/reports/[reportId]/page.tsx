import Link from "next/link";

import { ReportPublicationControls } from "@/components/report-publication/report-publication-controls";
import { PageHeader } from "@/components/layout/page-header";
import { ReportPreview } from "@/components/report-snapshots/report-preview";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { getAuthorizationContext } from "@/lib/authorization/context";
import { getReportArtifactDescriptor } from "@/lib/report-publication/service";
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
  const [subjects, history, descriptor, authorization] = await Promise.all([
    getReportSubjects(reportId),
    getReportHistory(
      report.snapshot_data.placement.enrollment_id,
      report.snapshot_data.academic_period.term_id,
    ),
    getReportArtifactDescriptor(reportId),
    getAuthorizationContext(),
  ]);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Report snapshot v${report.report_version}`}
        title={report.snapshot_data.student.display_name}
        description={`${report.snapshot_data.student.admission_number} · ${report.snapshot_data.placement.class_name} · ${report.snapshot_data.academic_period.term_name}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              variant={report.status === "PUBLISHED" ? "success" : "neutral"}
            >
              {report.status}
            </Badge>
            <Badge variant={report.superseded_by ? "neutral" : "success"}>
              {report.superseded_by ? "Historical" : "Current"}
            </Badge>
            <a
              href={`/api/reports/${report.report_id}/pdf`}
              className={buttonStyles({ size: "sm", variant: "secondary" })}
              download
            >
              Download PDF
            </a>
          </div>
        }
      />
      <ReportPublicationControls
        reportId={reportId}
        descriptor={descriptor}
        canGenerate={authorization.permissions.has("REPORTS_GENERATE")}
        canReview={authorization.permissions.has("REPORTS_REVIEW")}
        canPublish={authorization.permissions.has("REPORTS_PUBLISH")}
        canWithdraw={authorization.permissions.has("REPORTS_WITHDRAW")}
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
