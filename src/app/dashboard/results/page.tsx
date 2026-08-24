import Link from "next/link";
import { Calculator } from "lucide-react";

import { CalculationForm } from "@/components/results-engine/calculation-form";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAnyPermission } from "@/lib/authorization/guards";
import {
  getResultCalculationOptions,
  getResultCalculationTerms,
} from "@/lib/results-engine/data";

export default async function ResultsDashboardPage() {
  const context = await requireAnyPermission([
    "REPORTS_VIEW_ALL",
    "REPORTS_GENERATE",
  ]);
  const canCalculate = context.permissions.has("REPORTS_GENERATE");
  const terms = await getResultCalculationTerms();
  const rows = await Promise.all(
    terms.map(async (term) => ({
      term,
      options: await getResultCalculationOptions(
        term.term_id,
        term.grade_level_id,
      ),
    })),
  );
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Stage 11 · locked academic values"
        title="Results calculations"
        description="Calculate immutable term-and-grade results from the latest locked mark-sheet revisions. This workspace does not publish reports or make promotion decisions."
        actions={
          <Badge variant={canCalculate ? "success" : "info"}>
            {canCalculate ? "Calculation access" : "Read-only review"}
          </Badge>
        }
      />
      {rows.length ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {rows.map(({ term, options }) => (
            <Card key={`${term.term_id}-${term.grade_level_id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      {term.academic_year_name} · {term.term_name} ·{" "}
                      {term.grade_name}
                    </CardTitle>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Term state: {term.term_status}
                    </p>
                  </div>
                  <Badge
                    variant={
                      term.term_status === "LOCKED" ? "success" : "warning"
                    }
                  >
                    {term.term_status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Latest version</dt>
                    <dd className="font-mono font-bold">
                      {term.latest_version ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Input checksum</dt>
                    <dd className="font-mono text-xs">
                      {term.input_checksum?.slice(0, 12) ?? "—"}
                    </dd>
                  </div>
                </dl>
                {term.latest_run_id ? (
                  <Link
                    className="text-primary text-sm font-semibold hover:underline"
                    href={`/dashboard/results/${term.latest_run_id}`}
                  >
                    Open latest calculation
                  </Link>
                ) : null}
                <CalculationForm
                  termId={term.term_id}
                  gradeLevelId={term.grade_level_id}
                  options={options}
                  canCalculate={canCalculate && term.term_status === "LOCKED"}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Calculator}
          title="No calculation scopes"
          description="No terms and active grade levels are visible for the selected school."
        />
      )}
    </div>
  );
}
