"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import {
  createClassSection,
  createCurriculumMapping,
  createTerm,
  type ConfigurationActionResult,
} from "@/lib/academic-configuration/actions";
import {
  classSectionSchema,
  curriculumMappingSchema,
  termSchema,
} from "@/lib/academic-configuration/schemas";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ResultMessage, selectClass } from "./form-feedback";

type Option = { id: string; label: string };
type FormKind = "term" | "class" | "curriculum";
type Values = Record<string, string | boolean>;

export function StructuredCreateForm({
  grades = [],
  kind,
  subjects = [],
  years = [],
}: {
  grades?: Option[];
  kind: FormKind;
  subjects?: Option[];
  years?: Option[];
}) {
  const [result, setResult] = useState<ConfigurationActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<Values>({
    defaultValues: {
      contributesToAggregate: true,
      isRequired: true,
      isPromotionTerm: false,
      sortOrder: "1",
    },
  });

  const submit = form.handleSubmit((values) => {
    const candidates = {
      term: {
        schema: termSchema,
        action: createTerm,
        value: {
          academicYearId: values.academicYearId,
          name: values.name,
          termNumber: values.termNumber,
          startsOn: values.startsOn,
          endsOn: values.endsOn,
          isPromotionTerm: values.isPromotionTerm,
        },
      },
      class: {
        schema: classSectionSchema,
        action: createClassSection,
        value: {
          academicYearId: values.academicYearId,
          gradeLevelId: values.gradeLevelId,
          name: values.name,
          classCode: values.code,
          capacity: values.capacity ?? "",
        },
      },
      curriculum: {
        schema: curriculumMappingSchema,
        action: createCurriculumMapping,
        value: {
          gradeLevelId: values.gradeLevelId,
          subjectId: values.subjectId,
          isRequired: values.isRequired,
          contributesToAggregate: values.contributesToAggregate,
          sortOrder: values.sortOrder,
        },
      },
    } as const;
    const candidate = candidates[kind];
    const parsed = candidate.schema.safeParse(candidate.value);
    if (!parsed.success) {
      setResult({
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Review the form values.",
      });
      return;
    }

    startTransition(async () => {
      const next = await candidate.action(parsed.data);
      setResult(next);
      if (next.ok) form.reset();
    });
  });

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <ResultMessage result={result} />
      {(kind === "term" || kind === "class") && (
        <div>
          <Label htmlFor={`${kind}-year`}>Academic year</Label>
          <select
            id={`${kind}-year`}
            className={selectClass}
            {...form.register("academicYearId")}
          >
            <option value="">Select a year</option>
            {years.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {(kind === "class" || kind === "curriculum") && (
        <div>
          <Label htmlFor={`${kind}-grade`}>Grade level</Label>
          <select
            id={`${kind}-grade`}
            className={selectClass}
            {...form.register("gradeLevelId")}
          >
            <option value="">Select a grade</option>
            {grades.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {kind === "curriculum" && (
        <div>
          <Label htmlFor="curriculum-subject">Subject</Label>
          <select
            id="curriculum-subject"
            className={selectClass}
            {...form.register("subjectId")}
          >
            <option value="">Select a subject</option>
            {subjects.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {kind !== "curriculum" && (
        <div>
          <Label htmlFor={`${kind}-name`}>
            {kind === "term" ? "Term name" : "Section name"}
          </Label>
          <Input id={`${kind}-name`} {...form.register("name")} />
        </div>
      )}
      {kind === "term" && (
        <>
          <div>
            <Label htmlFor="term-number">Term number</Label>
            <Input
              id="term-number"
              type="number"
              min={1}
              {...form.register("termNumber")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="term-start">Starts on</Label>
              <Input
                id="term-start"
                type="date"
                {...form.register("startsOn")}
              />
            </div>
            <div>
              <Label htmlFor="term-end">Ends on</Label>
              <Input id="term-end" type="date" {...form.register("endsOn")} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" {...form.register("isPromotionTerm")} />
            Promotion term
          </label>
        </>
      )}
      {kind === "class" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="class-code">Class code</Label>
            <Input id="class-code" {...form.register("code")} />
          </div>
          <div>
            <Label htmlFor="class-capacity">Capacity</Label>
            <Input
              id="class-capacity"
              type="number"
              min={1}
              {...form.register("capacity")}
            />
          </div>
        </div>
      )}
      {kind === "curriculum" && (
        <>
          <div>
            <Label htmlFor="mapping-order">Display order</Label>
            <Input
              id="mapping-order"
              type="number"
              min={1}
              {...form.register("sortOrder")}
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" {...form.register("isRequired")} />
            Required subject
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              {...form.register("contributesToAggregate")}
            />
            Contributes to aggregate
          </label>
        </>
      )}
      <Button type="submit" loading={isPending} loadingLabel="Saving draft">
        {kind === "term" || kind === "class"
          ? "Create draft"
          : "Create mapping"}
      </Button>
    </form>
  );
}
