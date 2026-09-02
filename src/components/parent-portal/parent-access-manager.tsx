"use client";

import { useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  issueStudentParentAccessCredential,
  revokeStudentParentAccessCredential,
  type ParentAccessActionResult,
  type ParentAccessStatus,
} from "@/lib/parent-portal/actions";

export function ParentAccessManager({
  studentId,
  status,
}: {
  studentId: string;
  status: ParentAccessStatus | null;
}) {
  const [result, setResult] = useState<ParentAccessActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<ParentAccessActionResult>) {
    startTransition(async () => setResult(await action()));
  }
  const credential = result?.ok ? result.credential : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Parent report access</CardTitle>
        <CardDescription>
          Issue one credential per student for an active guardian relationship
          marked as eligible. Existing sessions are revoked when credentials are
          reset.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status?.guardian_access_eligible ? (
          <Alert title="Guardian eligibility required" variant="warning">
            Enable report access on an active guardian relationship before
            issuing credentials.
          </Alert>
        ) : null}
        {status?.credential_active ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="success">Active credential</Badge>
            {status.last_used_at ? (
              <span className="text-muted-foreground">Used previously</span>
            ) : (
              <span className="text-muted-foreground">Never used</span>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No active credential.</p>
        )}
        {result ? (
          <Alert
            title={result.ok ? "Credential action complete" : "Not saved"}
            variant={result.ok ? "success" : "warning"}
          >
            {result.message}
          </Alert>
        ) : null}
        {credential ? (
          <div className="border-primary/30 bg-primary-soft grid gap-3 rounded-lg border p-4">
            <p className="font-semibold">One-time credential display</p>
            <p className="text-muted-foreground text-sm">
              Store or hand these details to the approved guardian now. They
              will not be shown again.
            </p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-xs font-semibold uppercase">
                  Access code
                </dt>
                <dd className="mt-1 font-mono text-sm">
                  {credential.access_code}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs font-semibold uppercase">
                  PIN
                </dt>
                <dd className="mt-1 font-mono text-sm">{credential.pin}</dd>
              </div>
            </dl>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!status?.guardian_access_eligible}
            loading={pending}
            onClick={() =>
              run(() => issueStudentParentAccessCredential(studentId))
            }
          >
            {status?.credential_active
              ? "Reset credentials"
              : "Issue credentials"}
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={!status?.credential_active}
            loading={pending}
            onClick={() =>
              run(() => revokeStudentParentAccessCredential(studentId))
            }
          >
            Revoke access
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
