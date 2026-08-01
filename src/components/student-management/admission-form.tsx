"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  admitStudent,
  type StudentActionResult,
} from "@/lib/student-management/actions";
import { admissionSchema } from "@/lib/student-management/schemas";

import { FieldError, ResultMessage, selectClass } from "./form-parts";

type YearOption = { id: string; name: string; status: string };
type ClassOption = {
  id: string;
  name: string;
  class_code: string;
  academic_year_id: string;
  capacity: number | null;
  activeCount: number;
};

export function AdmissionForm({
  years,
  classes,
  canOverrideCapacity,
  today,
}: {
  years: YearOption[];
  classes: ClassOption[];
  canOverrideCapacity: boolean;
  today: string;
}) {
  const router = useRouter();
  const [result, setResult] = useState<StudentActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<
    z.input<typeof admissionSchema>,
    unknown,
    z.output<typeof admissionSchema>
  >({
    resolver: zodResolver(admissionSchema),
    defaultValues: {
      admissionNumber: "",
      firstName: "",
      middleName: "",
      lastName: "",
      gender: "",
      dateOfBirth: "",
      admissionDate: today,
      academicYearId: "",
      classSectionId: "",
      classNumber: "",
      enrollmentStatus: "ACTIVE",
      capacityOverride: false,
      capacityOverrideReason: "",
      guardianFirstName: "",
      guardianMiddleName: "",
      guardianLastName: "",
      guardianPhone: "",
      guardianEmail: "",
      guardianRelationship: "Guardian",
    },
  });
  const yearId = useWatch({ control: form.control, name: "academicYearId" });
  const classId = useWatch({ control: form.control, name: "classSectionId" });
  const classOptions = useMemo(
    () => classes.filter((item) => item.academic_year_id === yearId),
    [classes, yearId],
  );
  const selectedClass = classes.find((item) => item.id === classId);
  const atCapacity = Boolean(
    selectedClass?.capacity &&
    selectedClass.activeCount >= selectedClass.capacity,
  );
  const academicYearField = form.register("academicYearId");

  const submit = form.handleSubmit((values) =>
    startTransition(async () => {
      const next = await admitStudent(values);
      setResult(next);
      if (next.ok && next.studentId)
        router.push(`/dashboard/students/${next.studentId}`);
    }),
  );

  return (
    <form onSubmit={submit} className="space-y-7" noValidate>
      <ResultMessage result={result} />
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="text-foreground col-span-full mb-1 text-base font-bold">
          Student identity
        </legend>
        <div>
          <Label htmlFor="admission-number">Admission number</Label>
          <Input
            id="admission-number"
            autoComplete="off"
            {...form.register("admissionNumber")}
          />
          <FieldError error={form.formState.errors.admissionNumber} />
        </div>
        <div>
          <Label htmlFor="student-gender">
            Gender{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Input
            id="student-gender"
            autoComplete="off"
            {...form.register("gender")}
          />
        </div>
        <div>
          <Label htmlFor="first-name">First name</Label>
          <Input
            id="first-name"
            autoComplete="given-name"
            {...form.register("firstName")}
          />
          <FieldError error={form.formState.errors.firstName} />
        </div>
        <div>
          <Label htmlFor="middle-name">
            Middle name{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Input
            id="middle-name"
            autoComplete="additional-name"
            {...form.register("middleName")}
          />
        </div>
        <div>
          <Label htmlFor="last-name">Last name</Label>
          <Input
            id="last-name"
            autoComplete="family-name"
            {...form.register("lastName")}
          />
          <FieldError error={form.formState.errors.lastName} />
        </div>
        <div>
          <Label htmlFor="date-of-birth">
            Date of birth{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Input
            id="date-of-birth"
            type="date"
            {...form.register("dateOfBirth")}
          />
        </div>
        <div>
          <Label htmlFor="admission-date">Admission date</Label>
          <Input
            id="admission-date"
            type="date"
            {...form.register("admissionDate")}
          />
          <FieldError error={form.formState.errors.admissionDate} />
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="text-foreground col-span-full mb-1 text-base font-bold">
          Initial enrolment{" "}
          <span className="text-muted-foreground text-sm font-normal">
            (optional)
          </span>
        </legend>
        <div>
          <Label htmlFor="academic-year">Academic year</Label>
          <select
            id="academic-year"
            className={selectClass}
            {...academicYearField}
            onChange={(event) => {
              void academicYearField.onChange(event);
              form.setValue("classSectionId", "");
            }}
          >
            <option value="">No initial enrolment</option>
            {years
              .filter(
                (year) => year.status === "DRAFT" || year.status === "ACTIVE",
              )
              .map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <Label htmlFor="class-section">Class</Label>
          <select
            id="class-section"
            className={selectClass}
            disabled={!yearId}
            {...form.register("classSectionId")}
          >
            <option value="">Choose a class</option>
            {classOptions.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name} · {section.class_code}
              </option>
            ))}
          </select>
          <FieldError error={form.formState.errors.classSectionId} />
        </div>
        <div>
          <Label htmlFor="class-number">
            Class number{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Input
            id="class-number"
            autoComplete="off"
            {...form.register("classNumber")}
          />
        </div>
        <div>
          <Label htmlFor="enrollment-status">Enrolment status</Label>
          <select
            id="enrollment-status"
            className={selectClass}
            {...form.register("enrollmentStatus")}
          >
            <option value="ACTIVE">Active</option>
            <option value="REPEATING">Repeating (explicit)</option>
          </select>
        </div>
        {selectedClass?.capacity ? (
          <div
            className={`col-span-full rounded-lg border p-3 text-sm ${atCapacity ? "border-warning/30 bg-warning-soft text-warning-strong" : "bg-surface-muted text-muted-foreground"}`}
            role="status"
          >
            {selectedClass.activeCount} of {selectedClass.capacity} active
            places are currently used.
            {atCapacity ? " This class is at capacity." : ""}
          </div>
        ) : null}
        {atCapacity && canOverrideCapacity ? (
          <div className="col-span-full grid gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" {...form.register("capacityOverride")} />
              Approve capacity override
            </label>
            <div>
              <Label htmlFor="capacity-reason">Override reason</Label>
              <Input
                id="capacity-reason"
                {...form.register("capacityOverrideReason")}
              />
              <FieldError
                error={form.formState.errors.capacityOverrideReason}
              />
            </div>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="text-foreground col-span-full mb-1 text-base font-bold">
          First guardian{" "}
          <span className="text-muted-foreground text-sm font-normal">
            (optional; no login is created)
          </span>
        </legend>
        <div>
          <Label htmlFor="guardian-first">First name</Label>
          <Input
            id="guardian-first"
            autoComplete="off"
            {...form.register("guardianFirstName")}
          />
        </div>
        <div>
          <Label htmlFor="guardian-middle">Middle name</Label>
          <Input
            id="guardian-middle"
            autoComplete="off"
            {...form.register("guardianMiddleName")}
          />
        </div>
        <div>
          <Label htmlFor="guardian-last">Last name</Label>
          <Input
            id="guardian-last"
            autoComplete="off"
            {...form.register("guardianLastName")}
          />
        </div>
        <div>
          <Label htmlFor="guardian-relationship">Relationship</Label>
          <Input
            id="guardian-relationship"
            autoComplete="off"
            {...form.register("guardianRelationship")}
          />
        </div>
        <div>
          <Label htmlFor="guardian-phone">Phone in E.164 format</Label>
          <Input
            id="guardian-phone"
            type="tel"
            placeholder="+256…"
            autoComplete="off"
            {...form.register("guardianPhone")}
          />
        </div>
        <div>
          <Label htmlFor="guardian-email">Email</Label>
          <Input
            id="guardian-email"
            type="email"
            autoComplete="off"
            {...form.register("guardianEmail")}
          />
        </div>
        <FieldError error={form.formState.errors.guardianFirstName} />
      </fieldset>
      <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          type="submit"
          loading={isPending}
          loadingLabel="Admitting student…"
        >
          Admit student
        </Button>
      </div>
    </form>
  );
}
