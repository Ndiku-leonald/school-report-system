import Link from "next/link";
import { BarChart3, ShieldCheck } from "lucide-react";
import { z } from "zod";

import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/lib/authorization/guards";
import { getAnalyticsScopes, getSchoolAnalytics } from "@/lib/analytics/data";
import type {
  AnalyticsReadinessState,
  AnalyticsScope,
} from "@/lib/analytics/types";

const idSchema = z.string().uuid();

function safeId(value: string | undefined) {
  const parsed = value ? idSchema.safeParse(value) : null;
  return parsed?.success ? parsed.data : null;
}

function stateVariant(state: AnalyticsReadinessState) {
  return state === "CURRENT"
    ? "success"
    : state === "TERM_NOT_LOCKED"
      ? "warning"
      : "info";
}

function stateLabel(state: AnalyticsReadinessState) {
  return state === "CURRENT" ? "Current" : state.replaceAll("_", " ");
}

function uniqueTerms(scopes: AnalyticsScope[]) {
  return scopes.filter(
    (scope, index, all) =>
      all.findIndex((item) => item.term_id === scope.term_id) === index,
  );
}

export default async function AnalyticsLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string; grade?: string }>;
}) {
  await requirePermission("ANALYTICS_VIEW");
  const params = await searchParams;
  const scopes = await getAnalyticsScopes();
  const termId = safeId(params.term) ?? scopes[0]?.term_id ?? null;
  const termScopes = scopes.filter((scope) => scope.term_id === termId);
  const gradeId = safeId(params.grade) ?? termScopes[0]?.grade_level_id ?? null;
  const selectedScope =
    termScopes.find((scope) => scope.grade_level_id === gradeId) ??
    termScopes[0] ??
    null;
  const school = termId ? await getSchoolAnalytics(termId) : null;
  const terms = uniqueTerms(scopes);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Stage 16 · selected-school analytics"
        title="Academic analytics"
        description="A read-only view of authoritative, locked Stage 11 results. Every metric below declares its population and excludes stale calculation scopes."
        actions={
          <Badge variant="info">
            <ShieldCheck aria-hidden="true" className="mr-1 size-3.5" />
            ANALYTICS_VIEW
          </Badge>
        }
      />

      <Alert title="Confidential academic data">
        Use only for authorized school purposes. Analytics never exposes
        guardian, parent credential, date-of-birth, photo, or private report
        data.
      </Alert>

      <Card>
        <CardContent className="pt-5">
          <form
            className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            method="get"
          >
            <label className="text-sm font-semibold" htmlFor="term">
              Academic term
              <select
                id="term"
                name="term"
                defaultValue={termId ?? ""}
                className="border-border bg-surface focus-visible:ring-focus mt-2 min-h-11 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3"
              >
                {terms.map((term) => (
                  <option key={term.term_id} value={term.term_id}>
                    {term.academic_year_name} · {term.term_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold" htmlFor="grade">
              Grade
              <select
                id="grade"
                name="grade"
                defaultValue={gradeId ?? ""}
                className="border-border bg-surface focus-visible:ring-focus mt-2 min-h-11 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3"
              >
                {termScopes.map((scope) => (
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
              className="bg-primary text-primary-foreground hover:bg-primary-strong focus-visible:ring-focus min-h-11 rounded-lg px-4 text-sm font-semibold outline-none focus-visible:ring-3"
              type="submit"
            >
              Apply filters
            </button>
          </form>
        </CardContent>
      </Card>

      {school ? (
        <section
          aria-labelledby="school-overview-heading"
          className="space-y-4"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="school-overview-heading"
                className="text-xl font-bold tracking-tight"
              >
                School overview
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {school.academic_year_name} · {school.term_name}
              </p>
            </div>
            <p className="text-muted-foreground text-sm">
              Coverage:{" "}
              <strong className="text-foreground">
                {school.current_grade_count} of {school.eligible_grade_count}{" "}
                grades
              </strong>
            </p>
          </div>
          {school.excluded_grade_count > 0 ? (
            <Alert title="Partial coverage" variant="warning">
              Metrics include only current authoritative grade scopes.{" "}
              {school.excluded_grade_count} grade scope
              {school.excluded_grade_count === 1 ? " is" : "s are"} excluded.
            </Alert>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                "Learners included",
                school.analytics_population,
                `source population ${school.source_student_population}`,
              ],
              [
                "Complete results",
                school.complete_count,
                `${school.incomplete_count} incomplete`,
              ],
              [
                "Mean overall average",
                school.mean_overall_average === null
                  ? "—"
                  : school.mean_overall_average,
                `of ${school.average_population_count} averages`,
              ],
              [
                "Ranking eligible",
                school.ranking_eligible_count,
                `${school.graded_count} graded · ${school.aggregate_classified_count} classified`,
              ],
            ].map(([label, value, note]) => (
              <Card key={label}>
                <CardContent className="pt-5">
                  <p className="text-muted-foreground text-sm">{label}</p>
                  <p className="mt-2 font-mono text-2xl font-bold">{value}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{note}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            Mean overall average is the arithmetic mean of non-null Stage 11
            overall averages; its denominator is shown above. Completion uses
            Stage 11 is_complete.
          </p>
          <div className="border-border overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">Analytics coverage by grade</caption>
              <thead className="bg-surface-muted text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Grade</th>
                  <th className="px-4 py-3">Coverage state</th>
                  <th className="px-4 py-3">Source learners</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {school.coverage.map((coverage) => {
                  const scope = termScopes.find(
                    (item) => item.grade_level_id === coverage.grade_level_id,
                  );
                  return (
                    <tr key={coverage.grade_level_id}>
                      <td className="px-4 py-3 font-semibold">
                        {coverage.grade_name}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={stateVariant(coverage.state)}>
                          {stateLabel(coverage.state)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {coverage.source_student_population}
                      </td>
                      <td className="px-4 py-3">
                        {scope?.current_run_id &&
                        coverage.state === "CURRENT" ? (
                          <Link
                            className="text-primary font-semibold hover:underline"
                            href={`/dashboard/analytics/${scope.current_run_id}`}
                          >
                            Open grade analytics
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">
                            Resolve in results workflow
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="border-border bg-surface rounded-xl border p-8 text-center">
          <BarChart3
            className="text-muted-foreground mx-auto size-8"
            aria-hidden="true"
          />
          <h2 className="mt-3 text-lg font-bold">No analytics scope</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            No term and grade context is available for the selected school.
          </p>
        </section>
      )}

      {selectedScope ? (
        <section aria-labelledby="scope-heading" className="space-y-4">
          <div>
            <h2 id="scope-heading" className="text-xl font-bold tracking-tight">
              Calculation scopes
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Currentness is checked against the latest locked source sheets and
              the Stage 11 input checksum.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {termScopes.map((scope) => (
              <Card
                key={scope.grade_level_id}
                className={
                  scope.grade_level_id === selectedScope.grade_level_id
                    ? "ring-primary/30 ring-2"
                    : undefined
                }
              >
                <CardContent className="space-y-3 pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{scope.grade_name}</h3>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {scope.current_locked_source_scopes} /{" "}
                        {scope.expected_source_scopes} locked source scopes
                      </p>
                    </div>
                    <Badge variant={stateVariant(scope.readiness_state)}>
                      {stateLabel(scope.readiness_state)}
                    </Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Version</dt>
                      <dd className="font-mono">
                        {scope.calculation_version ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Learners</dt>
                      <dd className="font-mono">
                        {scope.analytics_population}
                      </dd>
                    </div>
                  </dl>
                  {scope.current_run_id &&
                  scope.readiness_state === "CURRENT" ? (
                    <Link
                      className="text-primary inline-flex font-semibold hover:underline"
                      href={`/dashboard/analytics/${scope.current_run_id}`}
                    >
                      Review authoritative run →
                    </Link>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {scope.readiness_state === "STALE_RUN"
                        ? "Recalculate results before reviewing this scope."
                        : "Complete the results calculation workflow before reviewing this scope."}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Selected membership remains authoritative. Changing schools, suspending
        membership, disabling a school, or revoking ANALYTICS_VIEW takes effect
        on the next request.
      </p>
    </div>
  );
}
