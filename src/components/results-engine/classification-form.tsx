"use client";

import { useState, useTransition } from "react";

import { saveAggregateClassificationAction } from "@/lib/results-engine/actions";
import type { ResultActionResult } from "@/lib/results-engine/types";

import { Alert } from "../ui/alert";
import { Button } from "../ui/button";

export function ClassificationForm({
  years,
  grades,
  canManage,
}: {
  years: { id: string; label: string }[];
  grades: { id: string; label: string }[];
  canManage: boolean;
}) {
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [grade, setGrade] = useState("");
  const [bands, setBands] = useState(
    '[{"minimumAggregate":4,"maximumAggregate":8,"label":"Configured band","description":"","sortOrder":1}]',
  );
  const [result, setResult] = useState<ResultActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const inputClass =
    "border-border bg-surface text-foreground min-h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-primary focus:ring-focus/20 focus:ring-3";
  return (
    <div className="space-y-4">
      <label className="block space-y-1 text-sm font-semibold">
        Scale name
        <input
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">
          Academic year
          <select
            className={inputClass}
            value={year}
            onChange={(event) => setYear(event.target.value)}
          >
            <option value="">All years</option>
            {years.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold">
          Grade level
          <select
            className={inputClass}
            value={grade}
            onChange={(event) => setGrade(event.target.value)}
          >
            <option value="">All grades</option>
            {grades.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-sm font-semibold">
        Bands JSON
        <textarea
          className={`${inputClass} min-h-32 py-2 font-mono text-xs`}
          value={bands}
          onChange={(event) => setBands(event.target.value)}
        />
        <span className="text-muted-foreground block text-xs font-normal">
          Each band needs minimumAggregate, maximumAggregate, label,
          description, and sortOrder. Ranges are validated by the database.
        </span>
      </label>
      <Button
        disabled={!canManage || pending}
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              setResult(
                await saveAggregateClassificationAction({
                  name,
                  academicYearId: year,
                  gradeLevelId: grade,
                  bands: JSON.parse(bands),
                }),
              );
            } catch {
              setResult({
                ok: false,
                message: "Enter valid JSON for the classification bands.",
              });
            }
          })
        }
      >
        Save draft
      </Button>
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
