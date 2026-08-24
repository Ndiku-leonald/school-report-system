"use client";

import { useState, useTransition } from "react";

import {
  createAggregateClassificationVersionAction,
  transitionAggregateClassificationAction,
  updateAggregateClassificationAction,
} from "@/lib/results-engine/actions";
import type {
  AggregateClassificationScale,
  ResultActionResult,
} from "@/lib/results-engine/types";

import { Alert } from "../ui/alert";
import { Button } from "../ui/button";

export function ClassificationScaleActions({
  scale,
  canManage,
}: {
  scale: AggregateClassificationScale;
  canManage: boolean;
}) {
  const [name, setName] = useState(scale.name);
  const [bands, setBands] = useState(
    JSON.stringify(
      scale.bands.map((band) => ({
        minimumAggregate: band.minimumAggregate,
        maximumAggregate: band.maximumAggregate,
        label: band.label,
        description: band.description ?? "",
        sortOrder: band.sortOrder,
      })),
    ),
  );
  const [result, setResult] = useState<ResultActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (operation: () => Promise<ResultActionResult>) =>
    startTransition(async () => {
      try {
        setResult(await operation());
      } catch {
        setResult({
          ok: false,
          message: "Enter valid JSON for the classification bands.",
        });
      }
    });
  const parsed = () => JSON.parse(bands) as unknown;
  return (
    <div className="mt-4 space-y-3">
      <label className="block space-y-1 text-xs font-semibold">
        Name
        <input
          className="border-border bg-surface min-h-9 w-full rounded-lg border px-3 text-sm"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!canManage || scale.is_active || Boolean(scale.retired_at)}
        />
      </label>
      <label className="block space-y-1 text-xs font-semibold">
        Bands JSON
        <textarea
          className="border-border bg-surface min-h-24 w-full rounded-lg border px-3 py-2 font-mono text-xs"
          value={bands}
          onChange={(event) => setBands(event.target.value)}
          disabled={!canManage || scale.is_active || Boolean(scale.retired_at)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {canManage && !scale.is_active && !scale.retired_at ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                run(() =>
                  updateAggregateClassificationAction({
                    id: scale.id,
                    expectedUpdatedAt: scale.updated_at,
                    academicYearId: scale.academic_year_id ?? "",
                    gradeLevelId: scale.grade_level_id ?? "",
                    name,
                    bands: parsed(),
                  }),
                )
              }
            >
              Save draft edits
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(() =>
                  transitionAggregateClassificationAction({
                    id: scale.id,
                    expectedUpdatedAt: scale.updated_at,
                    active: true,
                  }),
                )
              }
            >
              Activate
            </Button>
          </>
        ) : null}
        {canManage && scale.is_active ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                run(() =>
                  createAggregateClassificationVersionAction({
                    sourceId: scale.id,
                    expectedUpdatedAt: scale.updated_at,
                    name,
                    bands: parsed(),
                  }),
                )
              }
            >
              Create new version
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() =>
                run(() =>
                  transitionAggregateClassificationAction({
                    id: scale.id,
                    expectedUpdatedAt: scale.updated_at,
                    active: false,
                  }),
                )
              }
            >
              Retire
            </Button>
          </>
        ) : null}
      </div>
      {result ? (
        <Alert
          title={result.ok ? "Saved" : "Not saved"}
          variant={result.ok ? "success" : "warning"}
        >
          {result.message}
        </Alert>
      ) : null}
    </div>
  );
}
