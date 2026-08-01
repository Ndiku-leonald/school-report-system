"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateStudentProfile,
  type StudentActionResult,
} from "@/lib/student-management/actions";
import type { StudentDetail } from "@/lib/student-management/data";
import { studentProfileSchema } from "@/lib/student-management/schemas";

import { FieldError, ResultMessage } from "./form-parts";

export function ProfileForm({ student }: { student: StudentDetail }) {
  const router = useRouter();
  const [result, setResult] = useState<StudentActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<
    z.input<typeof studentProfileSchema>,
    unknown,
    z.output<typeof studentProfileSchema>
  >({
    resolver: zodResolver(studentProfileSchema),
    defaultValues: {
      studentId: student.student_id,
      expectedUpdatedAt: student.updated_at,
      admissionNumber: student.admission_number,
      firstName: student.first_name,
      middleName: student.middle_name ?? "",
      lastName: student.last_name,
      gender: student.gender ?? "",
      dateOfBirth: student.date_of_birth ?? "",
      admissionDate: student.admission_date,
    },
  });
  const submit = form.handleSubmit((values) =>
    startTransition(async () => {
      const next = await updateStudentProfile(values);
      setResult(next);
      if (next.ok) router.push(`/dashboard/students/${student.student_id}`);
    }),
  );
  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <ResultMessage result={result} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="edit-admission">Admission number</Label>
          <Input id="edit-admission" {...form.register("admissionNumber")} />
          <FieldError error={form.formState.errors.admissionNumber} />
        </div>
        <div>
          <Label htmlFor="edit-gender">Gender</Label>
          <Input id="edit-gender" {...form.register("gender")} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="edit-first">First name</Label>
          <Input id="edit-first" {...form.register("firstName")} />
          <FieldError error={form.formState.errors.firstName} />
        </div>
        <div>
          <Label htmlFor="edit-middle">Middle name</Label>
          <Input id="edit-middle" {...form.register("middleName")} />
        </div>
        <div>
          <Label htmlFor="edit-last">Last name</Label>
          <Input id="edit-last" {...form.register("lastName")} />
          <FieldError error={form.formState.errors.lastName} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="edit-birth">Date of birth</Label>
          <Input
            id="edit-birth"
            type="date"
            {...form.register("dateOfBirth")}
          />
        </div>
        <div>
          <Label htmlFor="edit-admitted">Admission date</Label>
          <Input
            id="edit-admitted"
            type="date"
            {...form.register("admissionDate")}
          />
          <FieldError error={form.formState.errors.admissionDate} />
        </div>
      </div>
      <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={isPending}>
          Save profile
        </Button>
      </div>
    </form>
  );
}
