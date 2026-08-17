"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  approveMarkSheetAction,
  createCorrectionRevisionAction,
  lockMarkSheetAction,
  resubmitMarkSheetAction,
  returnMarkSheetAction,
  startReviewAction,
  submitMarkSheetAction,
} from "@/lib/marks-workflow/actions";
import type { MarkSheetWorkflowDetail } from "@/lib/marks-workflow/types";

type SimpleAction = (input: {
  markSheetId: string;
  expectedUpdatedAt: string;
}) => Promise<{ ok: boolean; message: string; conflict?: boolean }>;

export function WorkflowActions({
  correctionHrefBase = "/teacher/marks",
  detail,
}: {
  correctionHrefBase?: "/teacher/marks" | "/dashboard/marks/review";
  detail: MarkSheetWorkflowDetail;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [isPending, startTransition] = useTransition();
  const transitionInput = {
    markSheetId: detail.mark_sheet_id,
    expectedUpdatedAt: detail.sheet_updated_at,
  };

  function run(label: string, action: SimpleAction) {
    if (!window.confirm(`Confirm: ${label.toLowerCase()}?`)) return;
    startTransition(async () => {
      const result = await action(transitionInput);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) router.refresh();
    });
  }

  function runReasoned(kind: "return" | "correction") {
    startTransition(async () => {
      const result =
        kind === "return"
          ? await returnMarkSheetAction({ ...transitionInput, reason })
          : await createCorrectionRevisionAction({
              sourceMarkSheetId: detail.mark_sheet_id,
              expectedSourceUpdatedAt: detail.sheet_updated_at,
              reason,
            });
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setReason("");
        if ("markSheetId" in result && result.markSheetId) {
          router.push(`${correctionHrefBase}/${result.markSheetId}`);
        } else {
          router.refresh();
        }
      }
    });
  }

  const hasAction =
    (detail.can_submit && detail.missing_required_cells === 0) ||
    detail.can_resubmit ||
    detail.can_start_review ||
    detail.can_return ||
    detail.can_approve ||
    detail.can_lock ||
    detail.can_create_correction;

  if (!hasAction) return null;

  return (
    <section className="space-y-4" aria-labelledby="workflow-actions-heading">
      <div>
        <h2 id="workflow-actions-heading" className="text-lg font-bold">
          Available actions
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Every transition rechecks your selected school, live authority, sheet
          version, and term state.
        </p>
      </div>
      {message ? (
        <Alert
          title={message.ok ? "Workflow updated" : "Action not completed"}
          variant={message.ok ? "success" : "warning"}
        >
          {message.text}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {detail.can_submit && detail.missing_required_cells === 0 ? (
          <Button
            loading={isPending}
            onClick={() => run("Submit mark sheet", submitMarkSheetAction)}
          >
            Submit for review
          </Button>
        ) : null}
        {detail.can_resubmit ? (
          <Button
            loading={isPending}
            onClick={() => run("Resubmit mark sheet", resubmitMarkSheetAction)}
          >
            Resubmit
          </Button>
        ) : null}
        {detail.can_start_review ? (
          <Button
            loading={isPending}
            onClick={() => run("Start review", startReviewAction)}
          >
            Start review
          </Button>
        ) : null}
        {detail.can_approve ? (
          <Button
            loading={isPending}
            onClick={() => run("Approve mark sheet", approveMarkSheetAction)}
          >
            Approve
          </Button>
        ) : null}
        {detail.can_lock ? (
          <Button
            loading={isPending}
            onClick={() => run("Lock mark sheet", lockMarkSheetAction)}
          >
            Lock sheet
          </Button>
        ) : null}
      </div>
      {detail.can_return || detail.can_create_correction ? (
        <div className="border-border max-w-2xl space-y-3 rounded-xl border p-4">
          <label
            className="block text-sm font-semibold"
            htmlFor="workflow-reason"
          >
            {detail.can_return ? "Return reason" : "Correction reason"}
          </label>
          <textarea
            className="border-border bg-surface min-h-28 w-full rounded-lg border px-3 py-2 text-sm"
            id="workflow-reason"
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain the issue clearly for the audit history."
            value={reason}
          />
          <Button
            disabled={reason.trim().length < 3}
            loading={isPending}
            variant={detail.can_return ? "danger" : "secondary"}
            onClick={() =>
              runReasoned(detail.can_return ? "return" : "correction")
            }
          >
            {detail.can_return
              ? "Return for correction"
              : "Create correction revision"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
