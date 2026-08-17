import { ListChecks } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSchoolMarkSheets } from "@/lib/marks-entry/data";

export default async function MarksOverviewPage() {
  const sheets = await getSchoolMarkSheets();
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Selected school"
        title="Marks overview"
        description="Read-only operational completeness for mark sheets. Review, approval, grades, averages and rankings are not part of Stage 9."
        actions={<Badge variant="info">Read only</Badge>}
      />
      {sheets.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sheets.map((sheet) => (
            <Card key={sheet.mark_sheet_id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle>
                    {sheet.grade_name} · {sheet.class_name}
                  </CardTitle>
                  <Badge>{sheet.workflow_status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="font-semibold">{sheet.subject_name}</p>
                  <p className="text-muted-foreground">
                    {sheet.academic_year_name} · {sheet.term_name}
                  </p>
                </div>
                <p>
                  {sheet.teacher_name} · {sheet.employee_number}
                </p>
                <p className="text-muted-foreground">
                  {sheet.assessment_scheme_name} · version {sheet.sheet_version}
                </p>
                <p
                  aria-label={`${sheet.entered_cells} of ${sheet.expected_cells} cells entered`}
                  className="font-semibold"
                >
                  {sheet.entered_cells} / {sheet.expected_cells} cells entered
                </p>
                <p className="text-muted-foreground text-xs">
                  Updated {new Date(sheet.updated_at).toLocaleString("en-UG")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ListChecks}
          title="No mark sheets"
          description="No DRAFT or historical mark sheets are visible in the selected school."
        />
      )}
    </div>
  );
}
