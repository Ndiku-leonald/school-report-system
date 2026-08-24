"use client";

import { useState, useTransition } from "react";

import { calculateGradeResultsAction } from "@/lib/results-engine/actions";
import type {
  ResultActionResult,
  ResultCalculationOption,
} from "@/lib/results-engine/types";

import { Alert } from "../ui/alert";
import { Button } from "../ui/button";

const selectClass =
  "border-border bg-surface text-foreground focus:border-primary focus:ring-focus/20 min-h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-3";

export function CalculationForm({
  termId,
  gradeLevelId,
  options,
  canCalculate,
}: {
  termId: string;
  gradeLevelId: string;
  options: ResultCalculationOption[];
  canCalculate: boolean;
}) {
  const [scale, setScale] = useState(
    options.find((option) => option.option_type === "GRADING_SCALE")
      ?.option_id ?? "",
  );
  const [ranking, setRanking] = useState(
    options.find((option) => option.option_type === "RANKING_RULE")
      ?.option_id ?? "",
  );
  const [classification, setClassification] = useState("");
  const [result, setResult] = useState<ResultActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const scales = options.filter(
    (option) => option.option_type === "GRADING_SCALE",
  );
  const rankings = options.filter(
    (option) => option.option_type === "RANKING_RULE",
  );
  const classifications = options.filter(
    (option) => option.option_type === "CLASSIFICATION_SCALE",
  );

  return (
    <div className="border-border space-y-3 border-t pt-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs font-semibold">
          Grading scale
          <select
            className={selectClass}
            value={scale}
            onChange={(event) => setScale(event.target.value)}
            disabled={!canCalculate || pending}
          >
            {scales.map((option) => (
              <option key={option.option_id} value={option.option_id}>
                {option.option_name} · v{option.option_version}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold">
          Ranking rule
          <select
            className={selectClass}
            value={ranking}
            onChange={(event) => setRanking(event.target.value)}
            disabled={!canCalculate || pending}
          >
            {rankings.map((option) => (
              <option key={option.option_id} value={option.option_id}>
                {option.option_name} · v{option.option_version} ·{" "}
                {option.tie_method}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold">
          Classification (optional)
          <select
            className={selectClass}
            value={classification}
            onChange={(event) => setClassification(event.target.value)}
            disabled={!canCalculate || pending}
          >
            <option value="">None</option>
            {classifications.map((option) => (
              <option key={option.option_id} value={option.option_id}>
                {option.option_name} · v{option.option_version}
              </option>
            ))}
          </select>
        </label>
      </div>
      {canCalculate ? (
        <Button
          size="sm"
          disabled={!scale || !ranking || pending}
          loading={pending}
          onClick={() =>
            startTransition(async () =>
              setResult(
                await calculateGradeResultsAction({
                  termId,
                  gradeLevelId,
                  gradingScaleId: scale,
                  rankingRuleId: ranking,
                  classificationScaleId: classification,
                }),
              ),
            )
          }
        >
          Calculate locked results
        </Button>
      ) : (
        <p className="text-muted-foreground text-sm">
          Read-only schoolwide access. A user with REPORTS_GENERATE can
          calculate this grade.
        </p>
      )}
      {result ? (
        <Alert
          title={result.ok ? "Calculation result" : "Calculation not saved"}
          variant={result.ok ? "success" : "warning"}
        >
          {result.message}
          {result.ok && result.runId ? (
            <span> Version {result.version}.</span>
          ) : null}
        </Alert>
      ) : null}
    </div>
  );
}
