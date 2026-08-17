import { BookOpenCheck } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { openDraftMarkSheetAction } from "@/lib/marks-entry/actions";
import { getMyMarkSheets } from "@/lib/marks-entry/data";

export default async function TeacherMarksPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [sheets, query] = await Promise.all([getMyMarkSheets(), searchParams]);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Selected membership"
        title="Marks entry"
        description="Open a DRAFT mark sheet for a current subject assignment. Entry is available only while its term is in MARKS_ENTRY."
        actions={<Badge variant="info">Draft only</Badge>}
      />
      {query.error ? (
        <Alert title="Mark sheet unavailable" variant="warning">
          Check that the assignment is current, the term is open for marks
          entry, and a complete active assessment scheme exists.
        </Alert>
      ) : null}
      {sheets.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sheets.map((sheet) => (
            <Card key={sheet.teaching_assignment_id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle>
                    {sheet.grade_name} · {sheet.class_name}
                  </CardTitle>
                  <Badge variant={sheet.editable ? "success" : "info"}>
                    {sheet.workflow_status ?? "Not opened"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="font-semibold">{sheet.subject_name}</p>
                  <p className="text-muted-foreground text-sm">
                    {sheet.academic_year_name} · {sheet.term_name} ·{" "}
                    {sheet.term_status}
                  </p>
                </div>
                {sheet.mark_sheet_id ? (
                  <Link
                    className={buttonStyles({ variant: "secondary" })}
                    href={`/teacher/marks/${sheet.mark_sheet_id}`}
                  >
                    {sheet.editable ? "Enter marks" : "View mark sheet"}
                  </Link>
                ) : sheet.editable ? (
                  <form
                    action={openDraftMarkSheetAction.bind(
                      null,
                      sheet.teaching_assignment_id,
                    )}
                  >
                    <Button type="submit">Open draft sheet</Button>
                  </form>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    This assignment is not currently editable.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={BookOpenCheck}
          title="No current subject assignments"
          description="Only current assignments held by this selected membership appear here."
        />
      )}
    </div>
  );
}
