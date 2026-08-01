"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import {
  createAssessmentSchemeVersion,
  saveAssessmentScheme,
  updateAssessmentSchemeDraft,
  type ConfigurationActionResult,
} from "@/lib/academic-configuration/actions";
import {
  assessmentSchemeSchema,
  assessmentSchemeUpdateSchema,
  assessmentSchemeVersionSchema,
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
type AssessmentMode = "create" | "edit" | "version";
type AssessmentValues = {
  termId: string;
  gradeLevelId: string;
  subjectId: string;
  name: string;
  effectiveFrom: string;
  components: {
    name: string;
    componentCode: string;
    maximumScore: number;
    weightPercentage: number;
    sortOrder: number;
    isRequired: boolean;
  }[];
};

const blankComponent = {
  name: "",
  componentCode: "",
  maximumScore: 100,
  weightPercentage: 0,
  sortOrder: 1,
  isRequired: true,
};

export function AssessmentSchemeForm({
  grades,
  initial,
  mode = "create",
  subjects,
  terms,
}: {
  grades: Option[];
  initial?: AssessmentValues & {
    id: string;
    updatedAt: string;
  };
  mode?: AssessmentMode;
  subjects: Option[];
  terms: Option[];
}) {
  const [result, setResult] = useState<ConfigurationActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<AssessmentValues>({
    defaultValues:
      initial ??
      ({
        termId: "",
        gradeLevelId: "",
        subjectId: "",
        name: "",
        effectiveFrom: "",
        components: [
          {
            ...blankComponent,
            name: "Assessment",
            componentCode: "ASSESS",
            weightPercentage: 100,
          },
        ],
      } satisfies AssessmentValues),
  });
  const components = useFieldArray({
    control: form.control,
    name: "components",
  });
  const watchedComponents =
    useWatch({ control: form.control, name: "components" }) ?? [];
  const total = watchedComponents.reduce(
    (sum, component) => sum + Number(component.weightPercentage || 0),
    0,
  );

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
            ? assessmentSchemeSchema
            : mode === "edit"
              ? assessmentSchemeUpdateSchema
              : assessmentSchemeVersionSchema;
        const parsed = schema.safeParse(candidate);
        if (!parsed.success) {
          setResult({
            ok: false,
            message:
              parsed.error.issues[0]?.message ??
              "Review the assessment scheme.",
          });
          return;
        }
        startTransition(async () => {
          const action =
            mode === "create"
              ? saveAssessmentScheme
              : mode === "edit"
                ? updateAssessmentSchemeDraft
                : createAssessmentSchemeVersion;
          const next = await action(parsed.data);
          setResult(next);
          if (next.ok && mode === "create") form.reset();
        });
      })}
    >
      <ResultMessage result={result} />
      {mode === "version" ? (
        <Alert title="New historical version">
          The source remains unchanged. This form creates a new draft with a new
          ID and incremented version.
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor={`assessment-term-${initial?.id ?? "new"}`}>
            Term
          </Label>
          <select
            id={`assessment-term-${initial?.id ?? "new"}`}
            className={selectClass}
            disabled={mode === "version"}
            {...form.register("termId", { required: "Select a term." })}
          >
            <option value="">Select a term</option>
            {terms.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {mode === "version" ? (
            <input type="hidden" {...form.register("termId")} />
          ) : null}
          <FieldError error={form.formState.errors.termId} />
        </div>
        <div>
          <Label htmlFor={`assessment-grade-${initial?.id ?? "new"}`}>
            Grade level
          </Label>
          <select
            id={`assessment-grade-${initial?.id ?? "new"}`}
            className={selectClass}
            disabled={mode === "version"}
            {...form.register("gradeLevelId", {
              required: "Select a grade.",
            })}
          >
            <option value="">Select a grade</option>
            {grades.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {mode === "version" ? (
            <input type="hidden" {...form.register("gradeLevelId")} />
          ) : null}
          <FieldError error={form.formState.errors.gradeLevelId} />
        </div>
        <div>
          <Label htmlFor={`assessment-subject-${initial?.id ?? "new"}`}>
            Subject
          </Label>
          <select
            id={`assessment-subject-${initial?.id ?? "new"}`}
            className={selectClass}
            disabled={mode === "version"}
            {...form.register("subjectId", {
              required: "Select a subject.",
            })}
          >
            <option value="">Select a subject</option>
            {subjects.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {mode === "version" ? (
            <input type="hidden" {...form.register("subjectId")} />
          ) : null}
          <FieldError error={form.formState.errors.subjectId} />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor={`assessment-name-${initial?.id ?? "new"}`}>
            Scheme name
          </Label>
          <Input
            id={`assessment-name-${initial?.id ?? "new"}`}
            {...form.register("name", { required: "Enter a scheme name." })}
          />
          <FieldError error={form.formState.errors.name} />
        </div>
        <div>
          <Label htmlFor={`assessment-effective-${initial?.id ?? "new"}`}>
            Effective from
          </Label>
          <Input
            id={`assessment-effective-${initial?.id ?? "new"}`}
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
          Assessment components
        </legend>
        <div
          className={`rounded-lg border p-3 text-sm ${
            total === 100
              ? "border-success/30 bg-success-soft text-success-strong"
              : "border-warning/30 bg-warning-soft text-warning-strong"
          }`}
          role="status"
        >
          Weight total: <strong>{total.toFixed(2)}%</strong>. Activation
          requires exactly 100%.
        </div>
        {components.fields.map((field, index) => (
          <div
            className="border-border bg-surface-muted grid gap-3 rounded-xl border p-4"
            key={field.id}
            role="group"
            aria-label={`Component ${index + 1}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Component {index + 1}</p>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Move component ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => components.swap(index, index - 1)}
                >
                  <ArrowUp aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Move component ${index + 1} down`}
                  disabled={index === components.fields.length - 1}
                  onClick={() => components.swap(index, index + 1)}
                >
                  <ArrowDown aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove component ${index + 1}`}
                  disabled={components.fields.length === 1}
                  onClick={() => components.remove(index)}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label
                  htmlFor={`assessment-${initial?.id ?? "new"}-${index}-name`}
                >
                  Name
                </Label>
                <Input
                  id={`assessment-${initial?.id ?? "new"}-${index}-name`}
                  {...form.register(`components.${index}.name`, {
                    required: "Enter a component name.",
                  })}
                />
                <FieldError
                  error={form.formState.errors.components?.[index]?.name}
                />
              </div>
              <div>
                <Label
                  htmlFor={`assessment-${initial?.id ?? "new"}-${index}-code`}
                >
                  Component code
                </Label>
                <Input
                  id={`assessment-${initial?.id ?? "new"}-${index}-code`}
                  {...form.register(`components.${index}.componentCode`, {
                    required: "Enter a component code.",
                  })}
                />
                <FieldError
                  error={
                    form.formState.errors.components?.[index]?.componentCode
                  }
                />
              </div>
              <div>
                <Label
                  htmlFor={`assessment-${initial?.id ?? "new"}-${index}-maximum`}
                >
                  Maximum score
                </Label>
                <Input
                  id={`assessment-${initial?.id ?? "new"}-${index}-maximum`}
                  type="number"
                  min={0.01}
                  step="0.01"
                  {...form.register(`components.${index}.maximumScore`, {
                    min: { value: 0.01, message: "Use a positive score." },
                    valueAsNumber: true,
                  })}
                />
              </div>
              <div>
                <Label
                  htmlFor={`assessment-${initial?.id ?? "new"}-${index}-weight`}
                >
                  Weight percentage
                </Label>
                <Input
                  id={`assessment-${initial?.id ?? "new"}-${index}-weight`}
                  type="number"
                  min={0.01}
                  max={100}
                  step="0.01"
                  {...form.register(`components.${index}.weightPercentage`, {
                    min: { value: 0.01, message: "Use a positive weight." },
                    max: { value: 100, message: "Maximum weight is 100." },
                    valueAsNumber: true,
                  })}
                />
                <FieldError
                  error={
                    form.formState.errors.components?.[index]?.weightPercentage
                  }
                />
              </div>
              <label className="flex items-center gap-2 self-end pb-3 text-sm font-medium">
                <input
                  type="checkbox"
                  {...form.register(`components.${index}.isRequired`)}
                />
                Required component
              </label>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          className="justify-self-start"
          onClick={() =>
            components.append({
              ...blankComponent,
              sortOrder: components.fields.length + 1,
            })
          }
        >
          <Plus aria-hidden="true" className="size-4" />
          Add component
        </Button>
      </fieldset>
      <Button type="submit" loading={isPending} loadingLabel="Saving scheme">
        {mode === "create"
          ? "Create draft scheme"
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
