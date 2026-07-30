"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import {
  removeCurriculumMapping,
  reorderGradeLevels,
  reorderSubjects,
  updateAcademicYear,
  updateClassSection,
  updateCurriculumMapping,
  updateGradeLevel,
  updateSubject,
  updateTerm,
  type ConfigurationActionResult,
} from "@/lib/academic-configuration/actions";

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

function useMutationResult() {
  const [result, setResult] = useState<ConfigurationActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  return { isPending, result, setResult, startTransition };
}

export function AcademicYearEditForm({
  year,
}: {
  year: {
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
    updatedAt: string;
  };
}) {
  const mutation = useMutationResult();
  const form = useForm({
    defaultValues: {
      name: year.name,
      startsOn: year.startsOn,
      endsOn: year.endsOn,
    },
  });

  return (
    <EditDisclosure label="Edit draft year">
      <form
        className="grid gap-4 md:grid-cols-3"
        onSubmit={form.handleSubmit((values) => {
          mutation.startTransition(async () => {
            mutation.setResult(
              await updateAcademicYear({
                ...values,
                id: year.id,
                expectedUpdatedAt: year.updatedAt,
              }),
            );
          });
        })}
      >
        <ResultMessage result={mutation.result} />
        <div>
          <Label htmlFor={`year-name-${year.id}`}>Academic year name</Label>
          <Input
            id={`year-name-${year.id}`}
            {...form.register("name", { required: "Enter a name." })}
          />
          <FieldError error={form.formState.errors.name} />
        </div>
        <div>
          <Label htmlFor={`year-start-${year.id}`}>Starts on</Label>
          <Input
            id={`year-start-${year.id}`}
            type="date"
            {...form.register("startsOn", { required: "Choose a start date." })}
          />
          <FieldError error={form.formState.errors.startsOn} />
        </div>
        <div>
          <Label htmlFor={`year-end-${year.id}`}>Ends on</Label>
          <Input
            id={`year-end-${year.id}`}
            type="date"
            {...form.register("endsOn", { required: "Choose an end date." })}
          />
          <FieldError error={form.formState.errors.endsOn} />
        </div>
        <Button
          className="md:col-span-3 md:justify-self-start"
          type="submit"
          loading={mutation.isPending}
          loadingLabel="Saving year"
        >
          Save year changes
        </Button>
      </form>
    </EditDisclosure>
  );
}

export function TermEditForm({
  term,
}: {
  term: {
    id: string;
    name: string;
    termNumber: number;
    startsOn: string;
    endsOn: string;
    isPromotionTerm: boolean;
    updatedAt: string;
  };
}) {
  const mutation = useMutationResult();
  const form = useForm({
    defaultValues: {
      name: term.name,
      termNumber: term.termNumber,
      startsOn: term.startsOn,
      endsOn: term.endsOn,
      isPromotionTerm: term.isPromotionTerm,
    },
  });

  return (
    <EditDisclosure label="Edit draft term">
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={form.handleSubmit((values) => {
          mutation.startTransition(async () => {
            mutation.setResult(
              await updateTerm({
                ...values,
                id: term.id,
                expectedUpdatedAt: term.updatedAt,
              }),
            );
          });
        })}
      >
        <ResultMessage result={mutation.result} />
        <div>
          <Label htmlFor={`term-name-${term.id}`}>Term name</Label>
          <Input
            id={`term-name-${term.id}`}
            {...form.register("name", { required: "Enter a name." })}
          />
        </div>
        <div>
          <Label htmlFor={`term-number-${term.id}`}>Term number</Label>
          <Input
            id={`term-number-${term.id}`}
            type="number"
            min={1}
            {...form.register("termNumber", {
              min: { value: 1, message: "Use a positive term number." },
              valueAsNumber: true,
            })}
          />
          <FieldError error={form.formState.errors.termNumber} />
        </div>
        <div>
          <Label htmlFor={`term-start-${term.id}`}>Starts on</Label>
          <Input
            id={`term-start-${term.id}`}
            type="date"
            {...form.register("startsOn", { required: true })}
          />
        </div>
        <div>
          <Label htmlFor={`term-end-${term.id}`}>Ends on</Label>
          <Input
            id={`term-end-${term.id}`}
            type="date"
            {...form.register("endsOn", { required: true })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium md:col-span-2">
          <input type="checkbox" {...form.register("isPromotionTerm")} />
          Promotion term
        </label>
        <Button
          className="md:col-span-2 md:justify-self-start"
          type="submit"
          loading={mutation.isPending}
          loadingLabel="Saving term"
        >
          Save term changes
        </Button>
      </form>
    </EditDisclosure>
  );
}

export function GradeLevelEditForm({
  grade,
}: {
  grade: {
    id: string;
    code: string;
    name: string;
    sortOrder: number;
    isFinalGrade: boolean;
    updatedAt: string;
  };
}) {
  const mutation = useMutationResult();
  const form = useForm({
    defaultValues: {
      code: grade.code,
      name: grade.name,
      sortOrder: grade.sortOrder,
      isFinalGrade: grade.isFinalGrade,
    },
  });

  return (
    <EditDisclosure label="Edit grade">
      <form
        className="grid gap-4 md:grid-cols-3"
        onSubmit={form.handleSubmit((values) => {
          mutation.startTransition(async () => {
            mutation.setResult(
              await updateGradeLevel({
                ...values,
                id: grade.id,
                expectedUpdatedAt: grade.updatedAt,
              }),
            );
          });
        })}
      >
        <ResultMessage result={mutation.result} />
        <div>
          <Label htmlFor={`grade-code-${grade.id}`}>Code</Label>
          <Input
            id={`grade-code-${grade.id}`}
            {...form.register("code", { required: "Enter a code." })}
          />
        </div>
        <div>
          <Label htmlFor={`grade-name-${grade.id}`}>Name</Label>
          <Input
            id={`grade-name-${grade.id}`}
            {...form.register("name", { required: "Enter a name." })}
          />
        </div>
        <div>
          <Label htmlFor={`grade-order-${grade.id}`}>Display order</Label>
          <Input
            id={`grade-order-${grade.id}`}
            type="number"
            min={1}
            {...form.register("sortOrder", { valueAsNumber: true })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium md:col-span-3">
          <input type="checkbox" {...form.register("isFinalGrade")} />
          Final grade in the school pathway
        </label>
        <Button
          className="md:col-span-3 md:justify-self-start"
          type="submit"
          loading={mutation.isPending}
          loadingLabel="Saving grade"
        >
          Save grade changes
        </Button>
      </form>
    </EditDisclosure>
  );
}

export function SubjectEditForm({
  subject,
}: {
  subject: {
    id: string;
    code: string;
    name: string;
    description: string;
    isCore: boolean;
    contributesToAggregate: boolean;
    sortOrder: number;
    updatedAt: string;
  };
}) {
  const mutation = useMutationResult();
  const form = useForm({
    defaultValues: {
      code: subject.code,
      name: subject.name,
      description: subject.description,
      isCore: subject.isCore,
      contributesToAggregate: subject.contributesToAggregate,
      sortOrder: subject.sortOrder,
    },
  });

  return (
    <EditDisclosure label="Edit subject">
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={form.handleSubmit((values) => {
          mutation.startTransition(async () => {
            mutation.setResult(
              await updateSubject({
                ...values,
                id: subject.id,
                expectedUpdatedAt: subject.updatedAt,
              }),
            );
          });
        })}
      >
        <ResultMessage result={mutation.result} />
        <div>
          <Label htmlFor={`subject-code-${subject.id}`}>Code</Label>
          <Input
            id={`subject-code-${subject.id}`}
            {...form.register("code", { required: "Enter a code." })}
          />
        </div>
        <div>
          <Label htmlFor={`subject-name-${subject.id}`}>Name</Label>
          <Input
            id={`subject-name-${subject.id}`}
            {...form.register("name", { required: "Enter a name." })}
          />
        </div>
        <div>
          <Label htmlFor={`subject-description-${subject.id}`}>
            Description
          </Label>
          <Input
            id={`subject-description-${subject.id}`}
            {...form.register("description")}
          />
        </div>
        <div>
          <Label htmlFor={`subject-order-${subject.id}`}>Display order</Label>
          <Input
            id={`subject-order-${subject.id}`}
            type="number"
            min={1}
            {...form.register("sortOrder", { valueAsNumber: true })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" {...form.register("isCore")} />
          Core subject
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" {...form.register("contributesToAggregate")} />
          Contributes to aggregate
        </label>
        <Button
          className="md:col-span-2 md:justify-self-start"
          type="submit"
          loading={mutation.isPending}
          loadingLabel="Saving subject"
        >
          Save subject changes
        </Button>
      </form>
    </EditDisclosure>
  );
}

export function ClassSectionEditForm({
  grades,
  scopeLocked,
  section,
  years,
}: {
  grades: Option[];
  scopeLocked: boolean;
  section: {
    id: string;
    academicYearId: string;
    gradeLevelId: string;
    name: string;
    classCode: string;
    capacity: number | null;
    updatedAt: string;
  };
  years: Option[];
}) {
  const mutation = useMutationResult();
  const form = useForm({
    defaultValues: {
      academicYearId: section.academicYearId,
      gradeLevelId: section.gradeLevelId,
      name: section.name,
      classCode: section.classCode,
      capacity: section.capacity ?? "",
    },
  });

  return (
    <EditDisclosure label="Edit class">
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={form.handleSubmit((values) => {
          mutation.startTransition(async () => {
            mutation.setResult(
              await updateClassSection({
                ...values,
                id: section.id,
                expectedUpdatedAt: section.updatedAt,
              }),
            );
          });
        })}
      >
        <ResultMessage result={mutation.result} />
        {scopeLocked ? (
          <div className="border-border bg-surface-muted text-muted-foreground rounded-lg border p-3 text-sm md:col-span-2">
            Year and grade are locked because this class has enrolments,
            assignments, mark sheets, or reports. Name, code, and capacity
            remain editable while the year is open for configuration.
            <input type="hidden" {...form.register("academicYearId")} />
            <input type="hidden" {...form.register("gradeLevelId")} />
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor={`class-year-${section.id}`}>Academic year</Label>
              <select
                id={`class-year-${section.id}`}
                className={selectClass}
                {...form.register("academicYearId")}
              >
                {years.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground mt-1 text-xs">
                Scope can move only before dependent academic records exist.
              </p>
            </div>
            <div>
              <Label htmlFor={`class-grade-${section.id}`}>Grade level</Label>
              <select
                id={`class-grade-${section.id}`}
                className={selectClass}
                {...form.register("gradeLevelId")}
              >
                {grades.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div>
          <Label htmlFor={`class-name-${section.id}`}>Section name</Label>
          <Input
            id={`class-name-${section.id}`}
            {...form.register("name", { required: "Enter a section name." })}
          />
        </div>
        <div>
          <Label htmlFor={`class-code-${section.id}`}>Class code</Label>
          <Input
            id={`class-code-${section.id}`}
            {...form.register("classCode", { required: "Enter a class code." })}
          />
        </div>
        <div>
          <Label htmlFor={`class-capacity-${section.id}`}>Capacity</Label>
          <Input
            id={`class-capacity-${section.id}`}
            type="number"
            min={1}
            {...form.register("capacity")}
          />
        </div>
        <Button
          className="md:col-span-2 md:justify-self-start"
          type="submit"
          loading={mutation.isPending}
          loadingLabel="Saving class"
        >
          Save class changes
        </Button>
      </form>
    </EditDisclosure>
  );
}

export function CurriculumMappingEditForm({
  mapping,
}: {
  mapping: {
    id: string;
    pairLabel: string;
    isRequired: boolean;
    contributesToAggregate: boolean;
    sortOrder: number;
    updatedAt: string;
    inUse: boolean;
  };
}) {
  const mutation = useMutationResult();
  const form = useForm({
    defaultValues: {
      isRequired: mapping.isRequired,
      contributesToAggregate: mapping.contributesToAggregate,
      sortOrder: mapping.sortOrder,
    },
  });

  return (
    <EditDisclosure label="Edit mapping">
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={form.handleSubmit((values) => {
          mutation.startTransition(async () => {
            mutation.setResult(
              await updateCurriculumMapping({
                ...values,
                id: mapping.id,
                expectedUpdatedAt: mapping.updatedAt,
              }),
            );
          });
        })}
      >
        <ResultMessage result={mutation.result} />
        <div className="border-border bg-surface-muted text-muted-foreground rounded-lg border p-3 text-sm md:col-span-2">
          Pair identity: <strong>{mapping.pairLabel}</strong>. To use a
          different grade and subject, create a new mapping.
        </div>
        <div>
          <Label htmlFor={`mapping-order-${mapping.id}`}>Display order</Label>
          <Input
            id={`mapping-order-${mapping.id}`}
            type="number"
            min={1}
            {...form.register("sortOrder", { valueAsNumber: true })}
          />
        </div>
        <div className="grid gap-2">
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
        </div>
        <div className="flex flex-wrap gap-3 md:col-span-2">
          <Button
            type="submit"
            loading={mutation.isPending}
            loadingLabel="Saving mapping"
          >
            Save mapping flags
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={mutation.isPending}
            onClick={() => {
              const warning = mapping.inUse
                ? "This mapping appears to be in use. Removal will be rejected unless every dependency has been cleared. Continue?"
                : "Remove this unused curriculum mapping?";
              if (!window.confirm(warning)) return;
              mutation.startTransition(async () => {
                mutation.setResult(
                  await removeCurriculumMapping({
                    id: mapping.id,
                    expectedUpdatedAt: mapping.updatedAt,
                  }),
                );
              });
            }}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Remove mapping
          </Button>
        </div>
      </form>
    </EditDisclosure>
  );
}

type OrderedItem = {
  id: string;
  label: string;
  updatedAt: string;
};

export function ConfigurationReorderForm({
  items,
  kind,
}: {
  items: OrderedItem[];
  kind: "grades" | "subjects";
}) {
  const [ordered, setOrdered] = useState(items);
  const mutation = useMutationResult();

  function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= ordered.length) return;
    setOrdered((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.startTransition(async () => {
          const action =
            kind === "grades" ? reorderGradeLevels : reorderSubjects;
          mutation.setResult(
            await action(
              ordered.map((item, index) => ({
                id: item.id,
                expectedUpdatedAt: item.updatedAt,
                sortOrder: index + 1,
              })),
            ),
          );
        });
      }}
    >
      <ResultMessage result={mutation.result} />
      <ol className="divide-border divide-y" aria-label={`${kind} order`}>
        {ordered.map((item, index) => (
          <li
            className="flex min-h-12 items-center justify-between gap-3 py-2"
            key={item.id}
          >
            <span className="text-sm font-medium">
              {index + 1}. {item.label}
            </span>
            <span className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={index === 0}
                aria-label={`Move ${item.label} up`}
                onClick={() => move(index, -1)}
              >
                <ArrowUp aria-hidden="true" className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={index === ordered.length - 1}
                aria-label={`Move ${item.label} down`}
                onClick={() => move(index, 1)}
              >
                <ArrowDown aria-hidden="true" className="size-4" />
              </Button>
            </span>
          </li>
        ))}
      </ol>
      <Button
        type="submit"
        loading={mutation.isPending}
        loadingLabel="Saving order"
      >
        Save {kind} order
      </Button>
    </form>
  );
}
