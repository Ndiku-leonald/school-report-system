"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  applyStudentProgression,
  confirmPromotionDecision,
  generatePromotionRecommendations,
  reopenPromotionDecision,
} from "@/lib/promotion/actions";
import {
  checksumPrefix,
  criterionStateLabel,
  promotionOutcomeLabel,
} from "@/lib/promotion/format";
import type {
  PromotionRecommendation,
  PromotionTargetClass,
} from "@/lib/promotion/types";

function snapshotValues(snapshot: Record<string, unknown> | null) {
  const result = (snapshot?.student_result ?? {}) as Record<string, unknown>;
  const rule = (snapshot?.promotion_rule ?? {}) as Record<string, unknown>;
  const criteria = Array.isArray(snapshot?.criteria)
    ? (snapshot.criteria as Record<string, unknown>[])
    : [];
  return { result, rule, criteria };
}

export function PromotionWorkspace({
  termId,
  gradeId,
  canConfirm,
  isFinalGrade,
  recommendations,
  targetClasses,
}: {
  termId: string;
  gradeId: string;
  canConfirm: boolean;
  isFinalGrade: boolean;
  recommendations: PromotionRecommendation[];
  targetClasses: Record<string, PromotionTargetClass[]>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      setFeedback(result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {feedback ? <Alert title="Promotion workflow">{feedback}</Alert> : null}
      {recommendations.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <p className="text-muted-foreground">
              No recommendations generated for this grade.
            </p>
          </CardContent>
        </Card>
      ) : null}
      {recommendations.map((recommendation) => {
        const { result, rule, criteria } = snapshotValues(
          recommendation.snapshot_data,
        );
        const classes = targetClasses[recommendation.decision_id] ?? [];
        const defaultFinal =
          recommendation.system_recommendation === "REPEAT_RECOMMENDED"
            ? "REPEAT_CONFIRMED"
            : recommendation.system_recommendation;
        const isStale = recommendation.state === "CONFIRMED_STALE";
        const isAcademicReview =
          recommendation.final_decision === "ACADEMIC_REVIEW";
        return (
          <Card key={recommendation.decision_id}>
            <CardContent className="space-y-5 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-muted-foreground text-xs uppercase">
                    Enrollment {recommendation.enrollment_id.slice(0, 8)}
                  </p>
                  <h2 className="mt-1 text-lg font-bold">
                    Recommendation v{recommendation.decision_version}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="info">
                    System:{" "}
                    {promotionOutcomeLabel(
                      recommendation.system_recommendation,
                    )}
                  </Badge>
                  <Badge
                    variant={
                      recommendation.final_decision ? "success" : "warning"
                    }
                  >
                    {recommendation.final_decision
                      ? `Final: ${promotionOutcomeLabel(recommendation.final_decision)}`
                      : "Not confirmed"}
                  </Badge>
                  {isStale ? (
                    <Badge variant="warning">Confirmed stale</Badge>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <Metric
                  label="Average"
                  value={String(result.overall_average ?? "Unavailable")}
                />
                <Metric
                  label="Aggregate"
                  value={String(result.aggregate_total ?? "Unavailable")}
                />
                <Metric
                  label="Subjects passed"
                  value={String(result.subjects_passed ?? "Unavailable")}
                />
                <Metric
                  label="Rule"
                  value={rule.version ? `v${rule.version}` : "Unavailable"}
                />
              </div>
              <div>
                <h3 className="font-semibold">Criterion evidence</h3>
                <div className="border-border mt-2 overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="bg-surface-muted text-muted-foreground text-xs uppercase">
                      <tr>
                        <th className="px-3 py-2">Criterion</th>
                        <th className="px-3 py-2">Threshold</th>
                        <th className="px-3 py-2">Actual</th>
                        <th className="px-3 py-2">State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-border divide-y">
                      {criteria.map((criterion, index) => (
                        <tr key={`${String(criterion.criterion)}-${index}`}>
                          <td className="px-3 py-2">
                            {String(criterion.criterion)}
                          </td>
                          <td className="px-3 py-2">
                            {String(criterion.threshold ?? "—")}
                          </td>
                          <td className="px-3 py-2">
                            {typeof criterion.actual === "object"
                              ? JSON.stringify(criterion.actual)
                              : String(criterion.actual ?? "Unavailable")}
                          </td>
                          <td className="px-3 py-2 font-semibold">
                            {criterionStateLabel(criterion.state)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                Calculation v
                {String(
                  recommendation.snapshot_data?.calculation_version ?? "?",
                )}{" "}
                · rule v{String(rule.version ?? "?")} · snapshot{" "}
                {checksumPrefix(recommendation.snapshot_checksum)}
              </p>
              {recommendation.progression_application_checksum ? (
                <p className="text-muted-foreground text-xs">
                  Application fingerprint{" "}
                  {checksumPrefix(
                    recommendation.progression_application_checksum,
                  )}
                </p>
              ) : null}
              {canConfirm && !recommendation.final_decision ? (
                <div className="bg-surface-muted grid gap-3 rounded-lg p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <label
                    className="text-sm font-semibold"
                    htmlFor={`decision-${recommendation.decision_id}`}
                  >
                    Final decision
                    <select
                      id={`decision-${recommendation.decision_id}`}
                      defaultValue={defaultFinal}
                      className="border-border bg-surface mt-1 min-h-10 w-full rounded-lg border px-2 text-sm"
                    >
                      {!isFinalGrade ? (
                        <>
                          <option value="PROMOTED">Promoted</option>
                          <option value="PROMOTED_WITH_SUPPORT">
                            Promoted with support
                          </option>
                        </>
                      ) : null}
                      <option value="ACADEMIC_REVIEW">Academic review</option>
                      <option value="REPEAT_CONFIRMED">Repeat confirmed</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  </label>
                  <label
                    className="text-sm font-semibold"
                    htmlFor={`reason-${recommendation.decision_id}`}
                  >
                    Override/reopen reason (when needed)
                    <input
                      id={`reason-${recommendation.decision_id}`}
                      className="border-border bg-surface mt-1 min-h-10 w-full rounded-lg border px-2 text-sm"
                      placeholder="Explain a different decision"
                    />
                  </label>
                  <Button
                    disabled={pending}
                    onClick={() => {
                      const outcome = document.getElementById(
                        `decision-${recommendation.decision_id}`,
                      ) as HTMLSelectElement;
                      const reason = document.getElementById(
                        `reason-${recommendation.decision_id}`,
                      ) as HTMLInputElement;
                      run(() =>
                        confirmPromotionDecision(
                          recommendation.decision_id,
                          recommendation.decision_version,
                          outcome.value,
                          reason.value,
                        ),
                      );
                    }}
                  >
                    Confirm decision
                  </Button>
                </div>
              ) : null}
              {canConfirm &&
              recommendation.final_decision &&
              recommendation.state !== "PROGRESSED" &&
              !isStale &&
              !isAcademicReview ? (
                <div className="border-border space-y-3 rounded-lg border p-3">
                  <p className="text-sm font-semibold">Explicit progression</p>
                  {classes.length ? (
                    <ProgressionControls
                      decisionId={recommendation.decision_id}
                      decisionVersion={recommendation.decision_version}
                      classes={classes}
                      pending={pending}
                      run={run}
                    />
                  ) : recommendation.final_decision === "COMPLETED" ? (
                    <Button
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          applyStudentProgression(
                            recommendation.decision_id,
                            recommendation.decision_version,
                            null,
                            null,
                          ),
                        )
                      }
                    >
                      Complete learner
                    </Button>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      No eligible target class is available.
                    </p>
                  )}
                </div>
              ) : null}
              {canConfirm &&
              recommendation.final_decision &&
              recommendation.state !== "PROGRESSED" &&
              !isStale ? (
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    const reason =
                      window.prompt(
                        "Reason for reopening this confirmed decision",
                      ) ?? "";
                    run(() =>
                      reopenPromotionDecision(
                        recommendation.decision_id,
                        recommendation.decision_version,
                        reason,
                      ),
                    );
                  }}
                >
                  Reopen decision
                </Button>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
      {canConfirm ? (
        <Button
          disabled={pending}
          onClick={() =>
            run(() => generatePromotionRecommendations(termId, gradeId))
          }
        >
          Generate recommendations
        </Button>
      ) : null}
    </div>
  );
}

function ProgressionControls({
  decisionId,
  decisionVersion,
  classes,
  pending,
  run,
}: {
  decisionId: string;
  decisionVersion: number;
  classes: PromotionTargetClass[];
  pending: boolean;
  run: (action: () => Promise<{ ok: boolean; message: string }>) => void;
}) {
  const [selected, setSelected] = useState(classes[0]?.class_section_id ?? "");
  const target = classes.find((item) => item.class_section_id === selected);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm font-semibold" htmlFor={`target-${decisionId}`}>
        Target class
        <select
          id={`target-${decisionId}`}
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="border-border bg-surface mt-1 min-h-10 rounded-lg border px-2 text-sm"
        >
          {classes.map((item) => (
            <option
              key={item.class_section_id}
              value={item.class_section_id}
              disabled={!item.is_available}
            >
              {item.class_name} · {item.occupied}/{item.capacity ?? "∞"}
            </option>
          ))}
        </select>
      </label>
      <Button
        disabled={pending || !target?.is_available}
        onClick={() =>
          run(() =>
            applyStudentProgression(
              decisionId,
              decisionVersion,
              target?.academic_year_id ?? null,
              selected,
            ),
          )
        }
      >
        Apply progression
      </Button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-mono font-semibold">{value}</p>
    </div>
  );
}
