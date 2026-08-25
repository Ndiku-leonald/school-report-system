import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  MarkSheetWorkflowDetail,
  MarkSheetWorkflowHistory,
} from "@/lib/marks-workflow/types";

export function WorkflowSummary({
  detail,
  history,
}: {
  detail: MarkSheetWorkflowDetail;
  history: MarkSheetWorkflowHistory[];
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Workflow status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              variant={
                detail.workflow_status === "LOCKED"
                  ? "success"
                  : detail.workflow_status === "RETURNED"
                    ? "warning"
                    : "info"
              }
            >
              {detail.workflow_status.replaceAll("_", " ")}
            </Badge>
            <span className="text-muted-foreground text-sm">
              Revision {detail.sheet_version} · Term{" "}
              {detail.term_status.replaceAll("_", " ")}
            </span>
          </div>
          <div>
            <div className="mb-2 flex justify-between text-sm">
              <span>Required cells recorded</span>
              <strong>
                {detail.recorded_required_cells} /{" "}
                {detail.expected_required_cells}
              </strong>
            </div>
            <div className="bg-surface-muted h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full"
                style={{
                  width: `${Math.min(100, Number(detail.completion_percentage))}%`,
                }}
              />
            </div>
          </div>
          {detail.return_reason ? (
            <p className="border-warning/30 bg-warning-soft rounded-lg border p-3 text-sm">
              <strong>Return reason:</strong> {detail.return_reason}
            </p>
          ) : null}
          {detail.actor_is_submitter ? (
            <p className="text-muted-foreground text-sm">
              Separation of duties applies: the submitter cannot review,
              approve, or lock this revision.
            </p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Audit history</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length ? (
            <ol className="space-y-4">
              {history.map((entry) => (
                <li
                  className="border-border border-l-2 pl-3 text-sm"
                  key={entry.audit_id}
                >
                  <p className="font-semibold">
                    {entry.workflow_action.replaceAll("_", " ")}
                  </p>
                  <p className="text-muted-foreground">
                    {entry.actor_display_name} ·{" "}
                    {new Date(entry.occurred_at).toLocaleString("en-UG")}
                  </p>
                  {entry.reason ? <p className="mt-1">{entry.reason}</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">
              No workflow transitions have been recorded yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
