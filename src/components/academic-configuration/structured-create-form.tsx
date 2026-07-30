"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import {
  createClassSection,
  createTerm,
  saveAssessmentScheme,
  saveGradingScale,
  savePromotionRule,
  saveRankingRule,
  setCurriculumMapping,
  type ConfigurationActionResult,
} from "@/lib/academic-configuration/actions";
import {
  assessmentSchemeSchema,
  classSectionSchema,
  curriculumMappingSchema,
  gradingScaleSchema,
  promotionRuleSchema,
  rankingRuleSchema,
  termSchema,
} from "@/lib/academic-configuration/schemas";

import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

type Option = { id: string; label: string };
type FormKind =
  | "term"
  | "class"
  | "curriculum"
  | "assessment"
  | "grading"
  | "ranking"
  | "promotion";
type Values = Record<string, string | boolean>;

const selectClass =
  "border-border bg-surface text-foreground focus:border-primary focus:ring-focus/20 min-h-11 w-full rounded-lg border px-3 text-sm outline-none focus:ring-3";
const textAreaClass =
  "border-border bg-surface text-foreground focus:border-primary focus:ring-focus/20 min-h-28 w-full rounded-lg border px-3 py-2 font-mono text-sm outline-none focus:ring-3";

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export function StructuredCreateForm({
  grades = [],
  kind,
  subjects = [],
  terms = [],
  years = [],
}: {
  grades?: Option[];
  kind: FormKind;
  subjects?: Option[];
  terms?: Option[];
  years?: Option[];
}) {
  const [result, setResult] = useState<ConfigurationActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<Values>({
    defaultValues: {
      contributesToAggregate: true,
      isPass: true,
      isRequired: true,
      isPromotionTerm: false,
      sortOrder: "1",
      components:
        '[{"name":"Assessment","componentCode":"ASSESS","maximumScore":100,"weightPercentage":100,"sortOrder":1,"isRequired":true}]',
      bands:
        '[{"minimumScore":0,"maximumScore":100,"grade":"Pass","aggregatePoints":1,"description":"","isPass":true,"sortOrder":1}]',
      configuration: "{}",
      requiredSubjectRules: "{}",
      additionalRules: "{}",
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
        action: setCurriculumMapping,
        value: {
          gradeLevelId: values.gradeLevelId,
          subjectId: values.subjectId,
          isRequired: values.isRequired,
          contributesToAggregate: values.contributesToAggregate,
          sortOrder: values.sortOrder,
        },
      },
      assessment: {
        schema: assessmentSchemeSchema,
        action: saveAssessmentScheme,
        value: {
          termId: values.termId,
          gradeLevelId: values.gradeLevelId,
          subjectId: values.subjectId,
          name: values.name,
          effectiveFrom: values.effectiveFrom,
          components: parseJson(String(values.components)),
        },
      },
      grading: {
        schema: gradingScaleSchema,
        action: saveGradingScale,
        value: {
          academicYearId: values.academicYearId ?? "",
          gradeLevelId: values.gradeLevelId ?? "",
          name: values.name,
          effectiveFrom: values.effectiveFrom,
          bands: parseJson(String(values.bands)),
        },
      },
      ranking: {
        schema: rankingRuleSchema,
        action: saveRankingRule,
        value: {
          academicYearId: values.academicYearId ?? "",
          gradeLevelId: values.gradeLevelId ?? "",
          name: values.name,
          rankingBasis: values.rankingBasis,
          tieMethod: values.tieMethod,
          configuration: parseJson(String(values.configuration)),
        },
      },
      promotion: {
        schema: promotionRuleSchema,
        action: savePromotionRule,
        value: {
          academicYearId: values.academicYearId ?? "",
          gradeLevelId: values.gradeLevelId ?? "",
          name: values.name,
          minimumAverage: values.minimumAverage ?? "",
          maximumAggregate: values.maximumAggregate ?? "",
          minimumSubjectsPassed: values.minimumSubjectsPassed ?? "",
          minimumAttendancePercentage: values.minimumAttendancePercentage ?? "",
          requiredSubjectRules: parseJson(String(values.requiredSubjectRules)),
          additionalRules: parseJson(String(values.additionalRules)),
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

  const requiresYear = [
    "term",
    "class",
    "grading",
    "ranking",
    "promotion",
  ].includes(kind);
  const requiresGrade = [
    "class",
    "curriculum",
    "assessment",
    "grading",
    "ranking",
    "promotion",
  ].includes(kind);
  const requiresSubject = ["curriculum", "assessment"].includes(kind);

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      {result ? (
        <Alert
          title={result.ok ? "Saved" : "Not saved"}
          variant={result.ok ? "success" : "warning"}
        >
          {result.message}
        </Alert>
      ) : null}
      {requiresYear ? (
        <div>
          <Label htmlFor={`${kind}-year`}>
            Academic year{kind !== "term" && kind !== "class" ? " scope" : ""}
          </Label>
          <select
            id={`${kind}-year`}
            className={selectClass}
            {...form.register("academicYearId")}
          >
            {kind !== "term" && kind !== "class" ? (
              <option value="">All years</option>
            ) : (
              <option value="">Select a year</option>
            )}
            {years.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {kind === "assessment" ? (
        <div>
          <Label htmlFor="assessment-term">Term</Label>
          <select
            id="assessment-term"
            className={selectClass}
            {...form.register("termId")}
          >
            <option value="">Select a term</option>
            {terms.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {requiresGrade ? (
        <div>
          <Label htmlFor={`${kind}-grade`}>
            Grade level
            {["grading", "ranking", "promotion"].includes(kind) ? " scope" : ""}
          </Label>
          <select
            id={`${kind}-grade`}
            className={selectClass}
            {...form.register("gradeLevelId")}
          >
            {["grading", "ranking", "promotion"].includes(kind) ? (
              <option value="">All grades</option>
            ) : (
              <option value="">Select a grade</option>
            )}
            {grades.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {requiresSubject ? (
        <div>
          <Label htmlFor={`${kind}-subject`}>Subject</Label>
          <select
            id={`${kind}-subject`}
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
      ) : null}
      {kind !== "curriculum" ? (
        <div>
          <Label htmlFor={`${kind}-name`}>
            {kind === "term"
              ? "Term name"
              : kind === "class"
                ? "Section name"
                : "Name"}
          </Label>
          <Input id={`${kind}-name`} {...form.register("name")} />
        </div>
      ) : null}
      {kind === "term" ? (
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
          <label className="flex gap-2 text-sm font-medium">
            <input type="checkbox" {...form.register("isPromotionTerm")} />
            Promotion term
          </label>
        </>
      ) : null}
      {kind === "class" ? (
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
      ) : null}
      {kind === "curriculum" ? (
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
          <label className="flex gap-2 text-sm font-medium">
            <input type="checkbox" {...form.register("isRequired")} />
            Required subject
          </label>
          <label className="flex gap-2 text-sm font-medium">
            <input
              type="checkbox"
              {...form.register("contributesToAggregate")}
            />
            Contributes to aggregate
          </label>
        </>
      ) : null}
      {["assessment", "grading"].includes(kind) ? (
        <div>
          <Label htmlFor={`${kind}-effective`}>Effective from</Label>
          <Input
            id={`${kind}-effective`}
            type="date"
            {...form.register("effectiveFrom")}
          />
        </div>
      ) : null}
      {kind === "assessment" ? (
        <div>
          <Label htmlFor="assessment-components">Components (JSON)</Label>
          <textarea
            id="assessment-components"
            className={textAreaClass}
            {...form.register("components")}
          />
        </div>
      ) : null}
      {kind === "grading" ? (
        <div>
          <Label htmlFor="grading-bands">Bands (JSON)</Label>
          <textarea
            id="grading-bands"
            className={textAreaClass}
            {...form.register("bands")}
          />
        </div>
      ) : null}
      {kind === "ranking" ? (
        <>
          <div>
            <Label htmlFor="ranking-basis">Ranking basis</Label>
            <select
              id="ranking-basis"
              className={selectClass}
              {...form.register("rankingBasis")}
            >
              <option value="TOTAL">Total</option>
              <option value="AVERAGE">Average</option>
              <option value="AGGREGATE">Aggregate</option>
              <option value="CONFIGURED">Configured</option>
            </select>
          </div>
          <div>
            <Label htmlFor="tie-method">Tie method</Label>
            <select
              id="tie-method"
              className={selectClass}
              {...form.register("tieMethod")}
            >
              <option value="DENSE">Dense</option>
              <option value="COMPETITION">Competition</option>
              <option value="ORDINAL">Ordinal</option>
              <option value="SHARED">Shared</option>
            </select>
          </div>
          <div>
            <Label htmlFor="ranking-configuration">Configuration (JSON)</Label>
            <textarea
              id="ranking-configuration"
              className={textAreaClass}
              {...form.register("configuration")}
            />
          </div>
        </>
      ) : null}
      {kind === "promotion" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="minimum-average">Minimum average</Label>
              <Input
                id="minimum-average"
                type="number"
                min={0}
                max={100}
                {...form.register("minimumAverage")}
              />
            </div>
            <div>
              <Label htmlFor="maximum-aggregate">Maximum aggregate</Label>
              <Input
                id="maximum-aggregate"
                type="number"
                min={1}
                {...form.register("maximumAggregate")}
              />
            </div>
            <div>
              <Label htmlFor="subjects-passed">Subjects passed</Label>
              <Input
                id="subjects-passed"
                type="number"
                min={0}
                {...form.register("minimumSubjectsPassed")}
              />
            </div>
            <div>
              <Label htmlFor="attendance">Minimum attendance</Label>
              <Input
                id="attendance"
                type="number"
                min={0}
                max={100}
                {...form.register("minimumAttendancePercentage")}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="required-subject-rules">
              Required-subject rules (JSON)
            </Label>
            <textarea
              id="required-subject-rules"
              className={textAreaClass}
              {...form.register("requiredSubjectRules")}
            />
          </div>
          <div>
            <Label htmlFor="additional-rules">Additional rules (JSON)</Label>
            <textarea
              id="additional-rules"
              className={textAreaClass}
              {...form.register("additionalRules")}
            />
          </div>
        </>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending
          ? "Saving…"
          : kind === "term" || kind === "class"
            ? "Create draft"
            : "Save draft"}
      </Button>
    </form>
  );
}
