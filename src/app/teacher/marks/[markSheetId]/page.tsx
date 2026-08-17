import { Badge } from "@/components/ui/badge";
import { MarksGrid } from "@/components/marks-entry/marks-grid";
import { PageHeader } from "@/components/layout/page-header";
import { getMarkSheetEditor } from "@/lib/marks-entry/data";

export default async function MarkSheetPage({
  params,
}: {
  params: Promise<{ markSheetId: string }>;
}) {
  const { markSheetId } = await params;
  const { details, grid } = await getMarkSheetEditor(markSheetId);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={`${details.academic_year_name} · ${details.term_name}`}
        title={`${details.grade_name} · ${details.class_name} · ${details.subject_name}`}
        description={`${details.assessment_scheme_name} · sheet version ${details.sheet_version}. Missing cells remain implicit until saved.`}
        actions={
          <Badge variant={details.editable ? "success" : "info"}>
            {details.workflow_status}
          </Badge>
        }
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
