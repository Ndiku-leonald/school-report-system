"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { generateGradeReportSnapshotsAction } from "@/lib/report-snapshots/actions";
import type {
  ReportActionResult,
  ReportGenerationReadiness,
} from "@/lib/report-snapshots/types";

import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

export function ReportGenerationCard({
  readiness,
  canGenerate,
}: {
  readiness: ReportGenerationReadiness;
  canGenerate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ReportActionResult | null>(null);
  const complete = readiness.missing_report_snapshots === 0;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>
            {readiness.academic_year_name} · {readiness.term_name} ·{" "}
            {readiness.grade_name}
          </CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Calculation v{readiness.calculation_version} ·{" "}
            {readiness.student_population} students
          </p>
        </div>
        {canGenerate ? (
          <Button
            size="sm"
            disabled={!readiness.ready || pending}
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const next = await generateGradeReportSnapshotsAction({
                  calculationRunId: readiness.calculation_run_id,
                });
                setResult(next);
                if (next.ok) router.refresh();
              })
            }
          >
            {complete ? "Regenerate from run" : "Generate reports"}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Students</dt>
            <dd className="font-mono font-semibold">
              {readiness.student_population}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Snapshots generated</dt>
            <dd className="font-mono font-semibold">
              {readiness.existing_report_snapshots}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Missing snapshots</dt>
            <dd className="font-mono font-semibold">
              {readiness.missing_report_snapshots}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Source output</dt>
            <dd className="font-mono text-xs font-semibold">
              {readiness.result_output_checksum.slice(0, 12)}…
            </dd>
          </div>
        </dl>
        <p className="text-muted-foreground mt-4 text-xs">
          {readiness.ready
            ? complete
              ? "Every student already has an immutable snapshot for this calculation run."
              : "Locked Stage 11 results are ready for immutable report snapshot generation."
            : "This calculation run is not ready for snapshot generation."}
        </p>
        {result ? (
          <Alert
            className="mt-4"
            title={result.ok ? "Report snapshots" : "Generation not saved"}
            variant={result.ok ? "success" : "warning"}
          >
            {result.message}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
