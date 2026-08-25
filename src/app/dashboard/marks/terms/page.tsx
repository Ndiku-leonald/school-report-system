import { CalendarCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { TermActions } from "@/components/marks-workflow/term-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMarksWorkflowTerms } from "@/lib/marks-workflow/data";

export default async function MarksWorkflowTermsPage() {
  const terms = await getMarksWorkflowTerms();
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Academic workflow"
        title="Term marks control"
        description="Open entry, verify readiness, advance review, lock completed results, or perform an audited controlled correction."
      />
      {terms.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {terms.map((term) => (
            <Card key={term.term_id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      {term.academic_year_name} · {term.term_name}
                    </CardTitle>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {term.starts_on} – {term.ends_on}
                    </p>
                  </div>
                  <Badge
                    variant={term.term_status === "LOCKED" ? "success" : "info"}
                  >
                    {term.term_status.replaceAll("_", " ")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Expected scopes</dt>
                    <dd className="font-bold">{term.expected_scopes}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Missing sheets</dt>
                    <dd className="font-bold">{term.missing_mark_sheets}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Missing assignments
                    </dt>
                    <dd className="font-bold">
                      {term.missing_teaching_assignments}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Locked revisions</dt>
                    <dd className="font-bold">{term.locked_sheets}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={term.ready_for_review ? "success" : "warning"}
                  >
                    {term.ready_for_review
                      ? "Ready for review"
                      : "Review blocked"}
                  </Badge>
                  <Badge variant={term.ready_for_lock ? "success" : "warning"}>
                    {term.ready_for_lock ? "Ready to lock" : "Lock blocked"}
                  </Badge>
                </div>
                <TermActions term={term} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CalendarCheck}
          title="No terms available"
          description="No academic terms are visible in the selected school."
        />
      )}
    </div>
  );
}
