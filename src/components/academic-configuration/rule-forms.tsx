"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import {
  createPromotionRuleVersion,
  createRankingRuleVersion,
  savePromotionRule,
  saveRankingRule,
  updatePromotionRuleDraft,
  updateRankingRuleDraft,
  type ConfigurationActionResult,
} from "@/lib/academic-configuration/actions";
import {
  promotionRuleSchema,
  promotionRuleUpdateSchema,
  promotionRuleVersionSchema,
  rankingRuleSchema,
  rankingRuleUpdateSchema,
  rankingRuleVersionSchema,
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
type RuleMode = "create" | "edit" | "version";
type RankingBasis = "TOTAL" | "AVERAGE" | "AGGREGATE" | "CONFIGURED";
type RankingValues = {
  academicYearId: string;
  gradeLevelId: string;
  name: string;
  rankingBasis: RankingBasis;
  tieMethod: "DENSE" | "COMPETITION" | "ORDINAL" | "SHARED";
  direction: "ASC" | "DESC";
  includeIncomplete: boolean;
  minimumSubjects: number | "";
  configuredMetric: "TOTAL" | "AVERAGE" | "AGGREGATE" | "";
};

export function RankingRuleForm({
  grades,
  initial,
  mode = "create",
  years,
}: {
  grades: Option[];
  initial?: RankingValues & { id: string; updatedAt: string };
  mode?: RuleMode;
  years: Option[];
}) {
  const [result, setResult] = useState<ConfigurationActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<RankingValues>({
    defaultValues:
      initial ??
      ({
        academicYearId: "",
        gradeLevelId: "",
        name: "",
        rankingBasis: "AVERAGE",
        tieMethod: "DENSE",
        direction: "DESC",
        includeIncomplete: false,
        minimumSubjects: "",
        configuredMetric: "",
      } satisfies RankingValues),
  });
  const rankingBasis = useWatch({
    control: form.control,
    name: "rankingBasis",
  });

  const content = (
    <form
      className="grid gap-4"
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
        const candidate = {
          academicYearId: values.academicYearId,
          gradeLevelId: values.gradeLevelId,
          name: values.name,
          rankingBasis: values.rankingBasis,
          tieMethod: values.tieMethod,
          configuration: {
            schemaVersion: 1,
            direction: values.direction,
            includeIncomplete: values.includeIncomplete,
            minimumSubjects: values.minimumSubjects,
            configuredMetric:
              values.rankingBasis === "CONFIGURED"
                ? values.configuredMetric || null
                : null,
          },
          ...identity,
        };
        const schema =
          mode === "create"
            ? rankingRuleSchema
            : mode === "edit"
              ? rankingRuleUpdateSchema
              : rankingRuleVersionSchema;
        const parsed = schema.safeParse(candidate);
        if (!parsed.success) {
          setResult({
            ok: false,
            message:
              parsed.error.issues[0]?.message ?? "Review the ranking rule.",
          });
          return;
        }
        startTransition(async () => {
          const action =
            mode === "create"
              ? saveRankingRule
              : mode === "edit"
                ? updateRankingRuleDraft
                : createRankingRuleVersion;
          const next = await action(parsed.data);
          setResult(next);
          if (next.ok && mode === "create") form.reset();
        });
      })}
    >
      <ResultMessage result={result} />
      {mode === "version" ? (
        <Alert title="New historical version">
          School, year, and grade scope are inherited. The source rule remains
          unchanged.
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor={`ranking-year-${initial?.id ?? "new"}`}>
            Academic year scope
          </Label>
          <select
            id={`ranking-year-${initial?.id ?? "new"}`}
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
          <Label htmlFor={`ranking-grade-${initial?.id ?? "new"}`}>
            Grade level scope
          </Label>
          <select
            id={`ranking-grade-${initial?.id ?? "new"}`}
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
      </div>
      <div>
        <Label htmlFor={`ranking-name-${initial?.id ?? "new"}`}>
          Rule name
        </Label>
        <Input
          id={`ranking-name-${initial?.id ?? "new"}`}
          {...form.register("name", { required: "Enter a rule name." })}
        />
        <FieldError error={form.formState.errors.name} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor={`ranking-basis-${initial?.id ?? "new"}`}>
            Ranking basis
          </Label>
          <select
            id={`ranking-basis-${initial?.id ?? "new"}`}
            className={selectClass}
            {...form.register("rankingBasis", {
              onChange(event) {
                const basis = event.target.value as RankingBasis;
                if (basis === "AGGREGATE") {
                  form.setValue("direction", "ASC");
                  form.setValue("configuredMetric", "");
                } else if (basis !== "CONFIGURED") {
                  form.setValue("direction", "DESC");
                  form.setValue("configuredMetric", "");
                }
              },
            })}
          >
            <option value="TOTAL">Total</option>
            <option value="AVERAGE">Average</option>
            <option value="AGGREGATE">Aggregate</option>
            <option value="CONFIGURED">Configured metric</option>
          </select>
        </div>
        <div>
          <Label htmlFor={`ranking-tie-${initial?.id ?? "new"}`}>
            Tie method
          </Label>
          <select
            id={`ranking-tie-${initial?.id ?? "new"}`}
            className={selectClass}
            {...form.register("tieMethod")}
          >
            <option value="DENSE">Dense</option>
            <option value="COMPETITION">Competition</option>
            <option value="ORDINAL">Ordinal</option>
            <option value="SHARED">Shared</option>
          </select>
        </div>
        {rankingBasis === "CONFIGURED" ? (
          <>
            <div>
              <Label htmlFor={`ranking-metric-${initial?.id ?? "new"}`}>
                Configured metric
              </Label>
              <select
                id={`ranking-metric-${initial?.id ?? "new"}`}
                className={selectClass}
                {...form.register("configuredMetric")}
              >
                <option value="">Select a metric</option>
                <option value="TOTAL">Total</option>
                <option value="AVERAGE">Average</option>
                <option value="AGGREGATE">Aggregate</option>
              </select>
            </div>
            <div>
              <Label htmlFor={`ranking-direction-${initial?.id ?? "new"}`}>
                Sort direction
              </Label>
              <select
                id={`ranking-direction-${initial?.id ?? "new"}`}
                className={selectClass}
                {...form.register("direction")}
              >
                <option value="DESC">Highest first</option>
                <option value="ASC">Lowest first</option>
              </select>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground self-end text-sm">
            {rankingBasis === "AGGREGATE"
              ? "Aggregate uses lowest first."
              : "Totals and averages use highest first."}
          </p>
        )}
        <div>
          <Label htmlFor={`ranking-minimum-${initial?.id ?? "new"}`}>
            Minimum completed subjects
          </Label>
          <Input
            id={`ranking-minimum-${initial?.id ?? "new"}`}
            type="number"
            min={0}
            {...form.register("minimumSubjects")}
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-3 text-sm font-medium">
          <input type="checkbox" {...form.register("includeIncomplete")} />
          Include incomplete results
        </label>
      </div>
      <Button
        type="submit"
        loading={isPending}
        loadingLabel="Saving ranking rule"
      >
        {mode === "create"
          ? "Create draft rule"
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

type PromotionValues = {
  academicYearId: string;
  gradeLevelId: string;
  name: string;
  minimumAverage: number | "";
  maximumAggregate: number | "";
  minimumSubjectsPassed: number | "";
  minimumAttendancePercentage: number | "";
  requiredSubjectRules: {
    subjectId: string;
    require: "PASS" | "COMPLETE";
  }[];
  requireCompleteResult: boolean;
  successOutcome: "PROMOTED" | "PROMOTED_WITH_SUPPORT";
  failureOutcome: "ACADEMIC_REVIEW" | "REPEAT_RECOMMENDED";
  incompleteOutcome: "ACADEMIC_REVIEW" | "REPEAT_RECOMMENDED";
};

export function PromotionRuleForm({
  grades,
  initial,
  mode = "create",
  subjects,
  years,
}: {
  grades: Option[];
  initial?: PromotionValues & { id: string; updatedAt: string };
  mode?: RuleMode;
  subjects: Option[];
  years: Option[];
}) {
  const [result, setResult] = useState<ConfigurationActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<PromotionValues>({
    defaultValues:
      initial ??
      ({
        academicYearId: "",
        gradeLevelId: "",
        name: "",
        minimumAverage: "",
        maximumAggregate: "",
        minimumSubjectsPassed: "",
        minimumAttendancePercentage: "",
        requiredSubjectRules: [],
        requireCompleteResult: true,
        successOutcome: "PROMOTED",
        failureOutcome: "ACADEMIC_REVIEW",
        incompleteOutcome: "ACADEMIC_REVIEW",
      } satisfies PromotionValues),
  });
  const requiredSubjects = useFieldArray({
    control: form.control,
    name: "requiredSubjectRules",
  });

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
        const candidate = {
          academicYearId: values.academicYearId,
          gradeLevelId: values.gradeLevelId,
          name: values.name,
          minimumAverage: values.minimumAverage,
          maximumAggregate: values.maximumAggregate,
          minimumSubjectsPassed: values.minimumSubjectsPassed,
          minimumAttendancePercentage: values.minimumAttendancePercentage,
          requiredSubjectRules: values.requiredSubjectRules,
          additionalRules: {
            schemaVersion: 1,
            requireCompleteResult: values.requireCompleteResult,
            successOutcome: values.successOutcome,
            failureOutcome: values.failureOutcome,
            incompleteOutcome: values.incompleteOutcome,
          },
          ...identity,
        };
        const schema =
          mode === "create"
            ? promotionRuleSchema
            : mode === "edit"
              ? promotionRuleUpdateSchema
              : promotionRuleVersionSchema;
        const parsed = schema.safeParse(candidate);
        if (!parsed.success) {
          setResult({
            ok: false,
            message:
              parsed.error.issues[0]?.message ?? "Review the promotion rule.",
          });
          return;
        }
        startTransition(async () => {
          const action =
            mode === "create"
              ? savePromotionRule
              : mode === "edit"
                ? updatePromotionRuleDraft
                : createPromotionRuleVersion;
          const next = await action(parsed.data);
          setResult(next);
          if (next.ok && mode === "create") form.reset();
        });
      })}
    >
      <ResultMessage result={result} />
      {mode === "version" ? (
        <Alert title="New historical version">
          Scope is inherited and the source rule remains unchanged.
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor={`promotion-year-${initial?.id ?? "new"}`}>
            Academic year scope
          </Label>
          <select
            id={`promotion-year-${initial?.id ?? "new"}`}
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
          <Label htmlFor={`promotion-grade-${initial?.id ?? "new"}`}>
            Grade level scope
          </Label>
          <select
            id={`promotion-grade-${initial?.id ?? "new"}`}
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
      </div>
      <div>
        <Label htmlFor={`promotion-name-${initial?.id ?? "new"}`}>
          Rule name
        </Label>
        <Input
          id={`promotion-name-${initial?.id ?? "new"}`}
          {...form.register("name", { required: "Enter a rule name." })}
        />
        <FieldError error={form.formState.errors.name} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor={`minimum-average-${initial?.id ?? "new"}`}>
            Minimum average
          </Label>
          <Input
            id={`minimum-average-${initial?.id ?? "new"}`}
            type="number"
            min={0}
            max={100}
            step="0.01"
            {...form.register("minimumAverage")}
          />
        </div>
        <div>
          <Label htmlFor={`maximum-aggregate-${initial?.id ?? "new"}`}>
            Maximum aggregate
          </Label>
          <Input
            id={`maximum-aggregate-${initial?.id ?? "new"}`}
            type="number"
            min={1}
            {...form.register("maximumAggregate")}
          />
        </div>
        <div>
          <Label htmlFor={`subjects-passed-${initial?.id ?? "new"}`}>
            Minimum subjects passed
          </Label>
          <Input
            id={`subjects-passed-${initial?.id ?? "new"}`}
            type="number"
            min={0}
            {...form.register("minimumSubjectsPassed")}
          />
        </div>
        <div>
          <Label htmlFor={`attendance-${initial?.id ?? "new"}`}>
            Minimum attendance
          </Label>
          <Input
            id={`attendance-${initial?.id ?? "new"}`}
            type="number"
            min={0}
            max={100}
            step="0.01"
            {...form.register("minimumAttendancePercentage")}
          />
        </div>
      </div>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold">
          Required-subject rules
        </legend>
        <p className="text-muted-foreground text-sm">
          Subjects must belong to this school and, when a grade is selected, to
          that grade’s curriculum.
        </p>
        {requiredSubjects.fields.map((field, index) => (
          <div
            className="border-border bg-surface-muted grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]"
            key={field.id}
          >
            <div>
              <Label
                htmlFor={`promotion-${initial?.id ?? "new"}-${index}-subject`}
              >
                Subject
              </Label>
              <select
                id={`promotion-${initial?.id ?? "new"}-${index}-subject`}
                className={selectClass}
                {...form.register(`requiredSubjectRules.${index}.subjectId`, {
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
              <FieldError
                error={
                  form.formState.errors.requiredSubjectRules?.[index]?.subjectId
                }
              />
            </div>
            <div>
              <Label
                htmlFor={`promotion-${initial?.id ?? "new"}-${index}-score`}
              >
                Required outcome
              </Label>
              <select
                id={`promotion-${initial?.id ?? "new"}-${index}-require`}
                className={selectClass}
                {...form.register(`requiredSubjectRules.${index}.require`)}
              >
                <option value="PASS">Must pass</option>
                <option value="COMPLETE">Must be complete</option>
              </select>
            </div>
            <Button
              className="self-end"
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Remove required subject ${index + 1}`}
              onClick={() => requiredSubjects.remove(index)}
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          className="justify-self-start"
          onClick={() =>
            requiredSubjects.append({ subjectId: "", require: "PASS" })
          }
        >
          <Plus aria-hidden="true" className="size-4" />
          Add required subject
        </Button>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold">Decision options</legend>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" {...form.register("requireCompleteResult")} />
          Require a complete result
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Successful complete result
          <select className={selectClass} {...form.register("successOutcome")}>
            <option value="PROMOTED">Promoted</option>
            <option value="PROMOTED_WITH_SUPPORT">Promoted with support</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Failed criterion outcome
          <select className={selectClass} {...form.register("failureOutcome")}>
            <option value="ACADEMIC_REVIEW">Academic review</option>
            <option value="REPEAT_RECOMMENDED">Repeat recommended</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Incomplete result outcome
          <select
            className={selectClass}
            {...form.register("incompleteOutcome")}
          >
            <option value="ACADEMIC_REVIEW">Academic review</option>
            <option value="REPEAT_RECOMMENDED">Repeat recommended</option>
          </select>
        </label>
      </fieldset>

      <Button
        type="submit"
        loading={isPending}
        loadingLabel="Saving promotion rule"
      >
        {mode === "create"
          ? "Create draft rule"
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
