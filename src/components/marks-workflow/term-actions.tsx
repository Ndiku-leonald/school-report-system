"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  advanceTermToReviewAction,
  lockTermMarksAction,
  openTermMarksEntryAction,
  reopenTermForCorrectionAction,
} from "@/lib/marks-workflow/actions";
import type { TermMarksWorkflow } from "@/lib/marks-workflow/types";

export function TermActions({ term }: { term: TermMarksWorkflow }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [isPending, startTransition] = useTransition();
  const input = {
    termId: term.term_id,
    expectedUpdatedAt: term.term_updated_at,
  };

  function run(
    action: (value: typeof input) => Promise<{ ok: boolean; message: string }>,
  ) {
    startTransition(async () => {
      const result = await action(input);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {message ? (
        <Alert
          title={message.ok ? "Term updated" : "Action not completed"}
          variant={message.ok ? "success" : "warning"}
        >
          {message.text}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {term.can_open_entry ? (
          <Button
            loading={isPending}
            onClick={() => run(openTermMarksEntryAction)}
          >
            Open marks entry
          </Button>
        ) : null}
        {term.can_advance_review ? (
          <Button
            loading={isPending}
            onClick={() => run(advanceTermToReviewAction)}
          >
            Advance to review
          </Button>
        ) : null}
        {term.can_lock_term ? (
          <Button loading={isPending} onClick={() => run(lockTermMarksAction)}>
            Lock term
          </Button>
        ) : null}
      </div>
      {term.can_reopen_term ? (
        <div className="space-y-2">
          <label
            className="block text-sm font-semibold"
            htmlFor={`reason-${term.term_id}`}
          >
            Controlled correction reason
          </label>
          <textarea
            className="border-border bg-surface min-h-24 w-full rounded-lg border px-3 py-2 text-sm"
            id={`reason-${term.term_id}`}
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
          <Button
            disabled={reason.trim().length < 3}
            loading={isPending}
            variant="danger"
            onClick={() =>
              startTransition(async () => {
                const result = await reopenTermForCorrectionAction({
                  ...input,
                  reason,
                });
                setMessage({ ok: result.ok, text: result.message });
                if (result.ok) {
                  setReason("");
                  router.refresh();
                }
              })
            }
          >
            Reopen for correction
          </Button>
        </div>
      ) : null}
    </div>
  );
}
