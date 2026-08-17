import { PageHeader } from "@/components/layout/page-header";
import { MarksGrid } from "@/components/marks-entry/marks-grid";
import { WorkflowActions } from "@/components/marks-workflow/workflow-actions";
import { WorkflowSummary } from "@/components/marks-workflow/workflow-summary";
import { Badge } from "@/components/ui/badge";
import { getMarkSheetEditor } from "@/lib/marks-entry/data";
import { getMarkSheetWorkflow } from "@/lib/marks-workflow/data";

export default async function MarksReviewDetailPage({
  params,
}: {
  params: Promise<{ markSheetId: string }>;
}) {
  const { markSheetId } = await params;
  const [{ details, grid }, workflow] = await Promise.all([
    getMarkSheetEditor(markSheetId),
    getMarkSheetWorkflow(markSheetId),
  ]);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={`${details.academic_year_name} · ${details.term_name}`}
        title={`${details.grade_name} · ${details.class_name} · ${details.subject_name}`}
        description={`${details.assessment_scheme_name} · revision ${details.sheet_version}. Values are read-only outside an authorized correction state.`}
        actions={
          <Badge
            variant={details.workflow_status === "LOCKED" ? "success" : "info"}
          >
            {details.workflow_status.replaceAll("_", " ")}
          </Badge>
        }
      />
      <WorkflowSummary detail={workflow.detail} history={workflow.history} />
      <WorkflowActions
        correctionHrefBase="/dashboard/marks/review"
        detail={workflow.detail}
      />
      <MarksGrid
        components={grid.components}
        editable={details.editable}
        markSheetId={details.mark_sheet_id}
        marks={grid.marks}
        roster={grid.roster}
      />
    </div>
  );
}
