import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { PromotionWorkspace } from "@/components/promotion/promotion-workspace";
import { requirePermission } from "@/lib/authorization/guards";
import {
  getPromotionRecommendations,
  getPromotionScopes,
  getPromotionTargetClasses,
} from "@/lib/promotion/data";

export default async function PromotionPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string; grade?: string }>;
}) {
  const context = await requirePermission("PROMOTION_VIEW");
  const params = await searchParams;
  const scopes = await getPromotionScopes();
  const selected =
    scopes.find(
      (scope) =>
        scope.term_id === params.term && scope.grade_level_id === params.grade,
    ) ??
    scopes.find((scope) => scope.is_promotion_term) ??
    scopes[0] ??
    null;
  if (!selected)
    return (
      <Alert title="Promotion unavailable">
        No academic scope is available for the selected school.
      </Alert>
    );
  const validScope = selected.readiness_state === "CURRENT";
  const recommendations = validScope
    ? await getPromotionRecommendations(
        selected.term_id,
        selected.grade_level_id,
      )
    : [];
  const classEntries = await Promise.all(
    recommendations
      .filter((item) => item.final_decision)
      .map(
        async (item) =>
          [
            item.decision_id,
            await getPromotionTargetClasses(item.decision_id),
          ] as const,
      ),
  );
  const targetClasses = Object.fromEntries(classEntries);
  const canConfirm = context.permissions.has("PROMOTION_CONFIRM");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Stage 17 · secure promotion"
        title="Promotion and progression"
        description="Recommendations are evidence-backed and never become final decisions automatically."
        actions={<Badge variant="info">PROMOTION_VIEW</Badge>}
      />
      <Card>
        <CardContent className="pt-5">
          <form
            className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            method="get"
          >
            <label className="text-sm font-semibold" htmlFor="term">
              Academic term
              <select
                id="term"
                name="term"
                defaultValue={selected.term_id}
                className="border-border bg-surface mt-1 min-h-11 w-full rounded-lg border px-3 text-sm"
              >
                {Array.from(
                  new Map(
                    scopes.map((scope) => [scope.term_id, scope]),
                  ).values(),
                ).map((scope) => (
                  <option key={scope.term_id} value={scope.term_id}>
                    {scope.academic_year_name} · {scope.term_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold" htmlFor="grade">
              Grade
              <select
                id="grade"
                name="grade"
                defaultValue={selected.grade_level_id}
                className="border-border bg-surface mt-1 min-h-11 w-full rounded-lg border px-3 text-sm"
              >
                {scopes
                  .filter((scope) => scope.term_id === selected.term_id)
                  .map((scope) => (
                    <option
                      key={scope.grade_level_id}
                      value={scope.grade_level_id}
                    >
                      {scope.grade_name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="bg-primary text-primary-foreground min-h-11 rounded-lg px-4 text-sm font-semibold"
              type="submit"
            >
              Apply filters
            </button>
          </form>
        </CardContent>
      </Card>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric
          label="Promotion term"
          value={selected.is_promotion_term ? "Configured" : "No"}
        />
        <Metric label="Academic year" value={selected.academic_year_name} />
        <Metric
          label="Rule"
          value={
            selected.rule_id
              ? `${selected.rule_name} · v${selected.rule_version}`
              : "No active promotion rule"
          }
        />
        <Metric
          label="Results"
          value={
            selected.current_run_id
              ? `Current · v${selected.calculation_version}`
              : "Unavailable"
          }
        />
        <Metric label="Learners" value={String(selected.learner_count)} />
      </section>
      {selected.readiness_state !== "CURRENT" ? (
        <Alert
          title={
            selected.readiness_state === "NO_ACTIVE_RULE"
              ? "No active promotion rule"
              : "Recommendations unavailable"
          }
        >
          {selected.readiness_state === "NO_ACTIVE_RULE" ? (
            <>
              Create an applicable rule in{" "}
              <Link
                className="font-semibold underline"
                href="/dashboard/academic/promotion"
              >
                Academic Configuration
              </Link>
              .
            </>
          ) : (
            "Authoritative results are missing or stale. Resolve this in the results workflow; Stage 17 never recalculates automatically."
          )}
        </Alert>
      ) : (
        <PromotionWorkspace
          termId={selected.term_id}
          gradeId={selected.grade_level_id}
          canConfirm={canConfirm}
          isFinalGrade={selected.grade_is_final}
          recommendations={recommendations}
          targetClasses={targetClasses}
        />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-1 font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
