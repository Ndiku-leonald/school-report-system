"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createClassTeacherAssignment,
  createTeachingAssignment,
  endClassTeacherAssignment,
  endTeachingAssignment,
  replacePrimaryClassTeacher,
  updateClassTeacherAssignment,
  updateTeachingAssignment,
  type AssignmentActionResult,
} from "@/lib/teacher-assignments/actions";
import type {
  EligibleClassTeacher,
  EligibleSubjectTeacher,
} from "@/lib/teacher-assignments/types";

export const selectClass =
  "border-border bg-surface text-foreground focus:border-primary focus:ring-focus/20 min-h-11 w-full rounded-lg border px-3 text-sm outline-none focus:ring-3 disabled:cursor-not-allowed disabled:opacity-60";
const textareaClass =
  "border-border bg-surface text-foreground focus:border-primary focus:ring-focus/20 min-h-24 w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-3";

function Result({ result }: { result: AssignmentActionResult | null }) {
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

type CreateScope = {
  termId: string;
  classSectionId: string;
  startsOn: string;
  endsOn: string | null;
};

export function TeachingAssignmentCreateForm({
  scope,
  subjectId,
  teachers,
}: {
  scope: CreateScope;
  subjectId: string;
  teachers: EligibleSubjectTeacher[];
}) {
  const router = useRouter();
  const [result, setResult] = useState<AssignmentActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const next = await createTeachingAssignment({
            ...scope,
            subjectId,
            staffMembershipId: form.get("teacher"),
          });
          setResult(next);
          if (next.ok && next.assignmentId)
            router.push(`/dashboard/assignments/teaching/${next.assignmentId}`);
        });
      }}
    >
      <Result result={result} />
      <div>
        <Label htmlFor="subject-teacher">Eligible subject teacher</Label>
        <select
          id="subject-teacher"
          name="teacher"
          className={selectClass}
          required
        >
          <option value="">Select an active subject teacher</option>
          {teachers.map((teacher) => (
            <option
              key={teacher.staff_membership_id}
              value={teacher.staff_membership_id}
              disabled={teacher.currently_assigned}
            >
              {teacher.display_name} · {teacher.employee_number}
              {teacher.currently_assigned ? " · overlaps this period" : ""}
            </option>
          ))}
        </select>
      </div>
      <p className="text-muted-foreground text-sm">
        Dates are inclusive and must remain inside the selected term. The
        database rechecks school, curriculum mapping, role eligibility and
        overlap rules at submission time.
      </p>
      <Button type="submit" loading={pending} disabled={!teachers.length}>
        Create subject assignment
      </Button>
    </form>
  );
}

export function ClassTeacherAssignmentCreateForm({
  scope,
  isPrimary,
  teachers,
}: {
  scope: CreateScope;
  isPrimary: boolean;
  teachers: EligibleClassTeacher[];
}) {
  const router = useRouter();
  const [result, setResult] = useState<AssignmentActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const next = await createClassTeacherAssignment({
            ...scope,
            isPrimary,
            staffMembershipId: form.get("teacher"),
          });
          setResult(next);
          if (next.ok && next.assignmentId)
            router.push(
              `/dashboard/assignments/class-teachers/${next.assignmentId}`,
            );
        });
      }}
    >
      <Result result={result} />
      <div>
        <Label htmlFor="class-teacher">Eligible class teacher</Label>
        <select
          id="class-teacher"
          name="teacher"
          className={selectClass}
          required
        >
          <option value="">Select an active class teacher</option>
          {teachers.map((teacher) => (
            <option
              key={teacher.staff_membership_id}
              value={teacher.staff_membership_id}
            >
              {teacher.display_name} · {teacher.employee_number}
            </option>
          ))}
        </select>
      </div>
      <Alert
        title={isPrimary ? "Primary assignment" : "Assistant assignment"}
        variant={isPrimary ? "warning" : "info"}
      >
        Primary periods cannot overlap. To change an effective primary, use the
        explicit atomic replacement workflow on the current assignment.
      </Alert>
      <Button type="submit" loading={pending} disabled={!teachers.length}>
        Create {isPrimary ? "primary" : "assistant"} assignment
      </Button>
    </form>
  );
}

export function AssignmentPeriodForm({
  assignmentId,
  expectedUpdatedAt,
  startsOn,
  endsOn,
  kind,
}: {
  assignmentId: string;
  expectedUpdatedAt: string;
  startsOn: string;
  endsOn: string | null;
  kind: "teaching" | "class";
}) {
  const router = useRouter();
  const [result, setResult] = useState<AssignmentActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const action =
          kind === "teaching"
            ? updateTeachingAssignment
            : updateClassTeacherAssignment;
        startTransition(async () => {
          const next = await action({
            assignmentId,
            expectedUpdatedAt,
            startsOn: form.get("startsOn"),
            endsOn: form.get("endsOn"),
          });
          setResult(next);
          if (next.ok) router.refresh();
        });
      }}
    >
      <Result result={result} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="assignment-start">Starts on</Label>
          <Input
            id="assignment-start"
            name="startsOn"
            type="date"
            defaultValue={startsOn}
            required
          />
        </div>
        <div>
          <Label htmlFor="assignment-end">Ends on (optional)</Label>
          <Input
            id="assignment-end"
            name="endsOn"
            type="date"
            defaultValue={endsOn ?? ""}
          />
        </div>
      </div>
      <Button type="submit" loading={pending}>
        Save dates
      </Button>
    </form>
  );
}

export function AssignmentEndForm({
  assignmentId,
  expectedUpdatedAt,
  defaultEnd,
  kind,
}: {
  assignmentId: string;
  expectedUpdatedAt: string;
  defaultEnd: string;
  kind: "teaching" | "class";
}) {
  const router = useRouter();
  const [result, setResult] = useState<AssignmentActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const action =
          kind === "teaching"
            ? endTeachingAssignment
            : endClassTeacherAssignment;
        startTransition(async () => {
          const next = await action({
            assignmentId,
            expectedUpdatedAt,
            endsOn: form.get("endsOn"),
            reason: form.get("reason"),
          });
          setResult(next);
          if (next.ok) router.refresh();
        });
      }}
    >
      <Result result={result} />
      <div>
        <Label htmlFor="end-effective">Final effective date</Label>
        <Input
          id="end-effective"
          name="endsOn"
          type="date"
          defaultValue={defaultEnd}
          required
        />
        <p className="text-muted-foreground mt-1 text-xs">
          Access remains effective through this date because assignment dates
          are inclusive.
        </p>
      </div>
      <div>
        <Label htmlFor="end-reason">Reason</Label>
        <textarea
          id="end-reason"
          name="reason"
          className={textareaClass}
          required
        />
      </div>
      <Button type="submit" variant="danger" loading={pending}>
        End assignment
      </Button>
    </form>
  );
}

export function PrimaryReplacementForm({
  termId,
  classSectionId,
  teachers,
  defaultStart,
}: {
  termId: string;
  classSectionId: string;
  teachers: EligibleClassTeacher[];
  defaultStart: string;
}) {
  const router = useRouter();
  const [result, setResult] = useState<AssignmentActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const next = await replacePrimaryClassTeacher({
            termId,
            classSectionId,
            staffMembershipId: form.get("teacher"),
            startsOn: form.get("startsOn"),
            reason: form.get("reason"),
          });
          setResult(next);
          if (next.ok) router.push("/dashboard/assignments?view=class");
        });
      }}
    >
      <Result result={result} />
      <Alert title="Atomic replacement" variant="warning">
        The former primary ends the day before this effective date. Both
        historical changes commit together or neither change is saved.
      </Alert>
      <div>
        <Label htmlFor="replacement-teacher">Replacement class teacher</Label>
        <select
          id="replacement-teacher"
          name="teacher"
          className={selectClass}
          required
        >
          <option value="">Select replacement</option>
          {teachers.map((teacher) => (
            <option
              key={teacher.staff_membership_id}
              value={teacher.staff_membership_id}
            >
              {teacher.display_name} · {teacher.employee_number}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="replacement-date">Effective date</Label>
        <Input
          id="replacement-date"
          name="startsOn"
          type="date"
          defaultValue={defaultStart}
          required
        />
      </div>
      <div>
        <Label htmlFor="replacement-reason">Reason</Label>
        <textarea
          id="replacement-reason"
          name="reason"
          className={textareaClass}
          required
        />
      </div>
      <Button type="submit" variant="danger" loading={pending}>
        Replace primary teacher
      </Button>
    </form>
  );
}
