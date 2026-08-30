"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  publishReviewedReportAction,
  reviewGeneratedReportAction,
  storeReportArtifactAction,
  withdrawPublishedReportAction,
} from "@/lib/report-publication/actions";
import type { ReportArtifactDescriptor } from "@/lib/report-publication/types";

import { Alert } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

function formatStoredAt(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Unavailable";
}

export function ReportPublicationControls({
  reportId,
  descriptor: initialDescriptor,
  canGenerate,
  canReview,
  canPublish,
  canWithdraw,
}: {
  reportId: string;
  descriptor: ReportArtifactDescriptor;
  canGenerate: boolean;
  canReview: boolean;
  canPublish: boolean;
  canWithdraw: boolean;
}) {
  const router = useRouter();
  const [descriptor, setDescriptor] = useState(initialDescriptor);
  const [reason, setReason] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(
    action: () => Promise<{
      ok: boolean;
      message: string;
      descriptor?: ReportArtifactDescriptor;
    }>,
  ) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(result.message);
      if (result.descriptor) setDescriptor(result.descriptor);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Publication workflow</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground text-sm">Report status</span>
          <Badge
            variant={descriptor.status === "PUBLISHED" ? "success" : "neutral"}
          >
            {descriptor.status}
          </Badge>
          <span className="text-muted-foreground text-sm">
            Private PDF artifact
          </span>
          <Badge variant={descriptor.has_artifact ? "success" : "warning"}>
            {descriptor.has_artifact ? "Stored" : "Not generated"}
          </Badge>
        </div>
        {descriptor.has_artifact ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Checksum</dt>
              <dd className="font-mono break-all">
                {descriptor.file_checksum}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Stored</dt>
              <dd>{formatStoredAt(descriptor.stored_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Renderer</dt>
              <dd className="font-mono">{descriptor.renderer_version}</dd>
            </div>
          </dl>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {canGenerate &&
          descriptor.status === "GENERATED" &&
          !descriptor.has_artifact ? (
            <Button
              loading={isPending}
              loadingLabel="Storing PDF"
              onClick={() =>
                run(() =>
                  storeReportArtifactAction({
                    reportId,
                    expectedWorkflowVersion: descriptor.workflow_version,
                  }),
                )
              }
            >
              Generate private PDF
            </Button>
          ) : null}
          {canReview &&
          descriptor.status === "GENERATED" &&
          descriptor.has_artifact ? (
            <Button
              loading={isPending}
              onClick={() =>
                run(() =>
                  reviewGeneratedReportAction({
                    reportId,
                    expectedWorkflowVersion: descriptor.workflow_version,
                  }),
                )
              }
            >
              Mark reviewed
            </Button>
          ) : null}
          {canPublish &&
          descriptor.status === "REVIEWED" &&
          descriptor.has_artifact ? (
            <Button onClick={() => setPublishOpen(true)}>Publish report</Button>
          ) : null}
          {canWithdraw && descriptor.status === "PUBLISHED" ? (
            <Button variant="danger" onClick={() => setWithdrawOpen(true)}>
              Withdraw publication
            </Button>
          ) : null}
          {descriptor.has_artifact ? (
            <a
              href={`/api/reports/${reportId}/artifact`}
              className="border-border bg-surface text-foreground hover:bg-surface-muted inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold"
              download
            >
              Download stored PDF
            </a>
          ) : null}
        </div>
        {publishOpen ? (
          <div
            role="dialog"
            aria-labelledby="publish-title"
            className="border-border bg-surface-muted space-y-3 rounded-lg border p-4"
          >
            <h3 id="publish-title" className="font-semibold">
              Confirm publication
            </h3>
            <p className="text-muted-foreground text-sm">
              Publishing makes this reviewed report eligible for future Stage 15
              parent access. Parent access is not created now.
            </p>
            <div className="flex gap-3">
              <Button
                loading={isPending}
                onClick={() => {
                  setPublishOpen(false);
                  run(() =>
                    publishReviewedReportAction({
                      reportId,
                      expectedWorkflowVersion: descriptor.workflow_version,
                    }),
                  );
                }}
              >
                Confirm publish
              </Button>
              <Button variant="secondary" onClick={() => setPublishOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
        {withdrawOpen ? (
          <div
            role="dialog"
            aria-labelledby="withdraw-title"
            className="border-border bg-surface-muted space-y-3 rounded-lg border p-4"
          >
            <h3 id="withdraw-title" className="font-semibold">
              Withdraw publication
            </h3>
            <p className="text-muted-foreground text-sm">
              The stored artifact and history will be retained.
            </p>
            <Label htmlFor="withdrawal-reason">Reason</Label>
            <Input
              id="withdrawal-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
              required
            />
            <div className="flex gap-3">
              <Button
                variant="danger"
                loading={isPending}
                disabled={!reason.trim()}
                onClick={() => {
                  setWithdrawOpen(false);
                  run(() =>
                    withdrawPublishedReportAction({
                      reportId,
                      expectedWorkflowVersion: descriptor.workflow_version,
                      reason,
                    }),
                  );
                }}
              >
                Confirm withdrawal
              </Button>
              <Button
                variant="secondary"
                onClick={() => setWithdrawOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
        {message ? (
          <Alert title="Workflow updated" variant="success">
            {message}
          </Alert>
        ) : null}
        {error ? (
          <Alert title="Workflow unavailable" variant="warning">
            {error}
          </Alert>
        ) : null}
        <p className="text-muted-foreground text-xs">
          Stored artifacts are private, checksum-verified, and distinct from the
          on-demand Stage 13 preview PDF.
        </p>
      </CardContent>
    </Card>
  );
}
