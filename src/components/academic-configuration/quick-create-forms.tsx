"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import {
  createAcademicYear,
  createGradeLevel,
  createSubject,
  type ConfigurationActionResult,
} from "@/lib/academic-configuration/actions";
import {
  academicYearSchema,
  gradeLevelSchema,
  subjectSchema,
} from "@/lib/academic-configuration/schemas";

import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

function ResultMessage({
  result,
}: {
  result: ConfigurationActionResult | null;
}) {
  if (!result) return null;
  return (
    <Alert
      role={result.ok ? "status" : "alert"}
      title={
        result.ok ? "Saved" : result.conflict ? "Refresh required" : "Not saved"
      }
      variant={result.ok ? "success" : "warning"}
    >
      {result.message}
    </Alert>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-danger mt-1 text-xs">{message}</p> : null;
}

export function AcademicYearCreateForm() {
  const [result, setResult] = useState<ConfigurationActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.input<typeof academicYearSchema>>({
    resolver: zodResolver(academicYearSchema),
    defaultValues: { name: "", startsOn: "", endsOn: "" },
  });

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      const next = await createAcademicYear(values);
      setResult(next);
      if (next.ok) form.reset();
    });
  });

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <ResultMessage result={result} />
      <div>
        <Label htmlFor="year-name">Academic year name</Label>
        <Input id="year-name" autoComplete="off" {...form.register("name")} />
        <FieldError message={form.formState.errors.name?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="year-start">Starts on</Label>
          <Input id="year-start" type="date" {...form.register("startsOn")} />
          <FieldError message={form.formState.errors.startsOn?.message} />
        </div>
        <div>
          <Label htmlFor="year-end">Ends on</Label>
          <Input id="year-end" type="date" {...form.register("endsOn")} />
          <FieldError message={form.formState.errors.endsOn?.message} />
        </div>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating…" : "Create draft year"}
      </Button>
    </form>
  );
}

export function GradeLevelCreateForm() {
  const [result, setResult] = useState<ConfigurationActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.input<typeof gradeLevelSchema>>({
    resolver: zodResolver(gradeLevelSchema),
    defaultValues: { code: "", name: "", sortOrder: 1, isFinalGrade: false },
  });

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      const next = await createGradeLevel(values);
      setResult(next);
      if (next.ok)
        form.reset({ code: "", name: "", sortOrder: 1, isFinalGrade: false });
    });
  });

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <ResultMessage result={result} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="grade-code">Code</Label>
          <Input
            id="grade-code"
            autoComplete="off"
            {...form.register("code")}
          />
          <FieldError message={form.formState.errors.code?.message} />
        </div>
        <div>
          <Label htmlFor="grade-name">Name</Label>
          <Input
            id="grade-name"
            autoComplete="off"
            {...form.register("name")}
          />
          <FieldError message={form.formState.errors.name?.message} />
        </div>
      </div>
      <div>
        <Label htmlFor="grade-order">Display order</Label>
        <Input
          id="grade-order"
          type="number"
          min={1}
          {...form.register("sortOrder")}
        />
        <FieldError message={form.formState.errors.sortOrder?.message} />
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" {...form.register("isFinalGrade")} />
        Final grade in the school pathway
      </label>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating…" : "Add grade level"}
      </Button>
    </form>
  );
}

export function SubjectCreateForm() {
  const [result, setResult] = useState<ConfigurationActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.input<typeof subjectSchema>>({
    resolver: zodResolver(subjectSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      isCore: false,
      contributesToAggregate: true,
      sortOrder: 1,
    },
  });

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      const next = await createSubject(values);
      setResult(next);
      if (next.ok) form.reset();
    });
  });

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <ResultMessage result={result} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="subject-code">Code</Label>
          <Input
            id="subject-code"
            autoComplete="off"
            {...form.register("code")}
          />
          <FieldError message={form.formState.errors.code?.message} />
        </div>
        <div>
          <Label htmlFor="subject-name">Name</Label>
          <Input
            id="subject-name"
            autoComplete="off"
            {...form.register("name")}
          />
          <FieldError message={form.formState.errors.name?.message} />
        </div>
      </div>
      <div>
        <Label htmlFor="subject-description">Description</Label>
        <Input
          id="subject-description"
          autoComplete="off"
          {...form.register("description")}
        />
      </div>
      <div>
        <Label htmlFor="subject-order">Display order</Label>
        <Input
          id="subject-order"
          type="number"
          min={1}
          {...form.register("sortOrder")}
        />
        <FieldError message={form.formState.errors.sortOrder?.message} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" {...form.register("isCore")} />
          Core subject
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" {...form.register("contributesToAggregate")} />
          Contributes to aggregate
        </label>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating…" : "Add subject"}
      </Button>
    </form>
  );
}
