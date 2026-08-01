"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import {
  createGradingScaleVersion,
  saveGradingScale,
  updateGradingScaleDraft,
  type ConfigurationActionResult,
} from "@/lib/academic-configuration/actions";
import {
  gradingScaleSchema,
  gradingScaleUpdateSchema,
  gradingScaleVersionSchema,
} from "@/lib/academic-configuration/schemas";

import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  EditDisclosure,
  FieldError,
  ResultMessage,
  selectClass,
} from "./form-feedback";

type Option = { id: string; label: string };
type GradingMode = "create" | "edit" | "version";
type GradingValues = {
  academicYearId: string;
  gradeLevelId: string;
  name: string;
  effectiveFrom: string;
  bands: {
    minimumScore: number;
    maximumScore: number;
    grade: string;
    aggregatePoints: number | "";
    description: string;
    isPass: boolean;
    sortOrder: number;
  }[];
};

const blankBand = {
  minimumScore: 0,
  maximumScore: 100,
  grade: "",
  aggregatePoints: "" as const,
  description: "",
  isPass: true,
  sortOrder: 1,
};

function coverageSummary(bands: GradingValues["bands"]) {
  const sorted = [...bands].sort(
    (left, right) =>
      Number(left.minimumScore || 0) - Number(right.minimumScore || 0),
  );
  const issues: string[] = [];
  if (sorted.length === 0) return { complete: false, issues: ["Add a band."] };
  if (Number(sorted[0]!.minimumScore) !== 0) {
    issues.push(`Gap from 0 to ${sorted[0]!.minimumScore}.`);
  }
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (Number(current.minimumScore) > Number(previous.maximumScore)) {
      issues.push(
        `Gap from ${previous.maximumScore} to ${current.minimumScore}.`,
      );
    }
    if (Number(current.minimumScore) < Number(previous.maximumScore)) {
      issues.push(
        `${previous.grade || "A band"} overlaps ${current.grade || "the next band"}.`,
      );
    }
  }
  const finalMaximum = Number(sorted.at(-1)!.maximumScore);
  if (finalMaximum !== 100) {
    issues.push(`Coverage ends at ${finalMaximum}, not 100.`);
  }
  return { complete: issues.length === 0, issues };
}

export function GradingScaleForm({
  grades,
  initial,
  mode = "create",
  years,
}: {
  grades: Option[];
  initial?: GradingValues & { id: string; updatedAt: string };
  mode?: GradingMode;
  years: Option[];
}) {
  const [result, setResult] = useState<ConfigurationActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<GradingValues>({
    defaultValues:
      initial ??
      ({
        academicYearId: "",
        gradeLevelId: "",
        name: "",
        effectiveFrom: "",
        bands: [{ ...blankBand, grade: "Pass", aggregatePoints: 1 }],
      } satisfies GradingValues),
  });
  const bands = useFieldArray({ control: form.control, name: "bands" });
  const watchedBands = useWatch({ control: form.control, name: "bands" }) ?? [];
  const coverage = coverageSummary(watchedBands);

  const content = (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        const identity = initial
          ? {
              ...(mode === "version"
                ? { sourceId: initial.id }
                : { id: initial.id }),
              expectedUpdatedAt: initial.updatedAt,
            }
          : {};
        const candidate = { ...values, ...identity };
        const schema =
          mode === "create"
            ? gradingScaleSchema
            : mode === "edit"
              ? gradingScaleUpdateSchema
              : gradingScaleVersionSchema;
        const parsed = schema.safeParse(candidate);
        if (!parsed.success) {
          setResult({
            ok: false,
            message:
              parsed.error.issues[0]?.message ?? "Review the grading scale.",
          });
          return;
        }
        startTransition(async () => {
          const action =
            mode === "create"
              ? saveGradingScale
              : mode === "edit"
                ? updateGradingScaleDraft
                : createGradingScaleVersion;
          const next = await action(parsed.data);
          setResult(next);
          if (next.ok && mode === "create") form.reset();
        });
      })}
    >
      <ResultMessage result={result} />
      {mode === "version" ? (
        <Alert title="New historical version">
          The source remains unchanged. Scope is inherited and the new draft
          receives a new ID and version.
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor={`grading-year-${initial?.id ?? "new"}`}>
            Academic year scope
          </Label>
          <select
            id={`grading-year-${initial?.id ?? "new"}`}
            className={selectClass}
            disabled={mode === "version"}
            {...form.register("academicYearId")}
          >
            <option value="">All years</option>
            {years.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {mode === "version" ? (
            <input type="hidden" {...form.register("academicYearId")} />
          ) : null}
        </div>
        <div>
          <Label htmlFor={`grading-grade-${initial?.id ?? "new"}`}>
            Grade level scope
          </Label>
          <select
            id={`grading-grade-${initial?.id ?? "new"}`}
            className={selectClass}
            disabled={mode === "version"}
            {...form.register("gradeLevelId")}
          >
            <option value="">All grades</option>
            {grades.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {mode === "version" ? (
            <input type="hidden" {...form.register("gradeLevelId")} />
          ) : null}
        </div>
        <div>
          <Label htmlFor={`grading-name-${initial?.id ?? "new"}`}>
            Scale name
          </Label>
          <Input
            id={`grading-name-${initial?.id ?? "new"}`}
            {...form.register("name", { required: "Enter a scale name." })}
          />
          <FieldError error={form.formState.errors.name} />
        </div>
        <div>
          <Label htmlFor={`grading-effective-${initial?.id ?? "new"}`}>
            Effective from
          </Label>
          <Input
            id={`grading-effective-${initial?.id ?? "new"}`}
            type="date"
            {...form.register("effectiveFrom", {
              required: "Choose an effective date.",
            })}
          />
          <FieldError error={form.formState.errors.effectiveFrom} />
        </div>
      </div>

      <fieldset className="grid gap-3">
        <legend className="text-foreground text-sm font-semibold">
          Grading bands
        </legend>
        <div
          className={`rounded-lg border p-3 text-sm ${
            coverage.complete
              ? "border-success/30 bg-success-soft text-success-strong"
              : "border-warning/30 bg-warning-soft text-warning-strong"
          }`}
          role={coverage.complete ? "status" : "alert"}
        >
          <p className="font-semibold">
            {coverage.complete
              ? "Complete 0–100 coverage"
              : "Coverage needs attention"}
          </p>
          {coverage.issues.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {coverage.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1">No gaps or overlaps detected.</p>
          )}
        </div>
        {bands.fields.map((field, index) => (
          <div
            className="border-border bg-surface-muted grid gap-3 rounded-xl border p-4"
            key={field.id}
            role="group"
            aria-label={`Band ${index + 1}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Band {index + 1}</p>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Move band ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => bands.swap(index, index - 1)}
                >
                  <ArrowUp aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Move band ${index + 1} down`}
                  disabled={index === bands.fields.length - 1}
                  onClick={() => bands.swap(index, index + 1)}
                >
                  <ArrowDown aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove band ${index + 1}`}
                  disabled={bands.fields.length === 1}
                  onClick={() => bands.remove(index)}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label
                  htmlFor={`grading-${initial?.id ?? "new"}-${index}-minimum`}
                >
                  Minimum score
                </Label>
                <Input
                  id={`grading-${initial?.id ?? "new"}-${index}-minimum`}
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  {...form.register(`bands.${index}.minimumScore`, {
                    min: { value: 0, message: "Minimum is 0." },
                    max: { value: 100, message: "Maximum is 100." },
                    valueAsNumber: true,
                  })}
                />
                <FieldError
                  error={form.formState.errors.bands?.[index]?.minimumScore}
                />
              </div>
              <div>
                <Label
                  htmlFor={`grading-${initial?.id ?? "new"}-${index}-maximum`}
                >
                  Maximum score
                </Label>
                <Input
                  id={`grading-${initial?.id ?? "new"}-${index}-maximum`}
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  {...form.register(`bands.${index}.maximumScore`, {
                    min: { value: 0, message: "Minimum is 0." },
                    max: { value: 100, message: "Maximum is 100." },
                    valueAsNumber: true,
                  })}
                />
                <FieldError
                  error={form.formState.errors.bands?.[index]?.maximumScore}
                />
              </div>
              <div>
                <Label
                  htmlFor={`grading-${initial?.id ?? "new"}-${index}-grade`}
                >
                  Grade
                </Label>
                <Input
                  id={`grading-${initial?.id ?? "new"}-${index}-grade`}
                  {...form.register(`bands.${index}.grade`, {
                    required: "Enter a grade.",
                  })}
                />
                <FieldError
                  error={form.formState.errors.bands?.[index]?.grade}
                />
              </div>
              <div>
                <Label
                  htmlFor={`grading-${initial?.id ?? "new"}-${index}-points`}
                >
                  Aggregate points
                </Label>
                <Input
                  id={`grading-${initial?.id ?? "new"}-${index}-points`}
                  type="number"
                  min={1}
                  {...form.register(`bands.${index}.aggregatePoints`)}
                />
              </div>
              <div className="lg:col-span-2">
                <Label
                  htmlFor={`grading-${initial?.id ?? "new"}-${index}-description`}
                >
                  Description
                </Label>
                <Input
                  id={`grading-${initial?.id ?? "new"}-${index}-description`}
                  {...form.register(`bands.${index}.description`)}
                />
              </div>
              <label className="flex items-center gap-2 self-end pb-3 text-sm font-medium">
                <input
                  type="checkbox"
                  {...form.register(`bands.${index}.isPass`)}
                />
                Passing band
              </label>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          className="justify-self-start"
          onClick={() =>
            bands.append({
              ...blankBand,
              sortOrder: bands.fields.length + 1,
            })
          }
        >
          <Plus aria-hidden="true" className="size-4" />
          Add band
        </Button>
      </fieldset>
      <Button type="submit" loading={isPending} loadingLabel="Saving scale">
        {mode === "create"
          ? "Create draft scale"
          : mode === "edit"
            ? "Save draft changes"
            : "Create new version"}
      </Button>
    </form>
  );

  if (mode === "create") return content;
  return (
    <EditDisclosure
      label={mode === "edit" ? "Edit draft" : "Create new version"}
    >
      {content}
    </EditDisclosure>
  );
}
