"use client";

import { Camera, ShieldCheck, UserRoundPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changeEnrollmentStatus,
  changeStudentStatus,
  createAndLinkGuardian,
  createStudentEnrollment,
  moveStudentClass,
  removeStudentPhoto,
  unlinkGuardian,
  updateGuardian,
  updateGuardianRelationship,
  updateStudentEnrollment,
  uploadStudentPhoto,
  type StudentActionResult,
} from "@/lib/student-management/actions";
import type {
  EnrollmentHistoryRow,
  GuardianRow,
  StudentDetail,
} from "@/lib/student-management/data";

import { ResultMessage, selectClass, textareaClass } from "./form-parts";

type ClassOption = {
  id: string;
  name: string;
  class_code: string;
  academic_year_id: string;
  capacity: number | null;
  activeCount: number;
};
type YearOption = { id: string; name: string; status: string };

function useMutationResult() {
  const router = useRouter();
  const [result, setResult] = useState<StudentActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<StudentActionResult>) {
    startTransition(async () => {
      const next = await action();
      setResult(next);
      if (next.ok) router.refresh();
    });
  }
  return { result, pending, run };
}

export function LifecycleForm({
  student,
  today,
}: {
  student: StudentDetail;
  today: string;
}) {
  const mutation = useMutationResult();
  const targets =
    student.status === "ACTIVE"
      ? ["TRANSFERRED", "WITHDRAWN", "COMPLETED", "DECEASED", "INACTIVE"]
      : student.status === "INACTIVE"
        ? ["ACTIVE", "TRANSFERRED", "WITHDRAWN"]
        : [];
  if (!targets.length)
    return (
      <Alert title="Terminal student status" variant="warning">
        This status is preserved as history. A future reviewed correction
        workflow is required to change it.
      </Alert>
    );
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        mutation.run(() =>
          changeStudentStatus({
            studentId: student.student_id,
            expectedUpdatedAt: student.updated_at,
            targetStatus: data.get("status"),
            effectiveDate: data.get("effectiveDate"),
            reason: data.get("reason"),
          }),
        );
      }}
    >
      <ResultMessage result={mutation.result} />
      <div>
        <Label htmlFor="student-target-status">New status</Label>
        <select
          id="student-target-status"
          name="status"
          className={selectClass}
        >
          {targets.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="student-status-date">Effective date</Label>
        <Input
          id="student-status-date"
          name="effectiveDate"
          type="date"
          defaultValue={today}
          required
        />
      </div>
      <div>
        <Label htmlFor="student-status-reason">Reason</Label>
        <textarea
          id="student-status-reason"
          name="reason"
          className={textareaClass}
          required
          minLength={3}
        />
      </div>
      <Button
        type="submit"
        variant="danger"
        loading={mutation.pending}
        loadingLabel="Updating status…"
      >
        Confirm status change
      </Button>
    </form>
  );
}

export function EnrollmentManager({
  student,
  history,
  years,
  classes,
  canOverrideCapacity,
  today,
}: {
  student: StudentDetail;
  history: EnrollmentHistoryRow[];
  years: YearOption[];
  classes: ClassOption[];
  canOverrideCapacity: boolean;
  today: string;
}) {
  const mutation = useMutationResult();
  const current = history.find(
    (item) => item.status === "ACTIVE" || item.status === "REPEATING",
  );
  const [yearId, setYearId] = useState(
    current?.academic_year_id ??
      years.find((year) => year.status === "ACTIVE")?.id ??
      "",
  );
  const [classId, setClassId] = useState(current?.class_section_id ?? "");
  const selectedClass = classes.find((item) => item.id === classId);
  const atCapacity = Boolean(
    selectedClass?.capacity &&
    selectedClass.activeCount >= selectedClass.capacity,
  );
  const destinations = classes.filter(
    (item) =>
      item.academic_year_id === yearId && item.id !== current?.class_section_id,
  );

  return (
    <div className="grid gap-6">
      <ResultMessage result={mutation.result} />
      {current ? (
        <>
          <Alert title="Current placement">
            {current.grade_name} · {current.class_name}
            {current.class_number
              ? ` · Class number ${current.class_number}`
              : ""}
          </Alert>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              mutation.run(() =>
                updateStudentEnrollment({
                  enrollmentId: current.enrollment_id,
                  expectedUpdatedAt: current.updated_at,
                  classNumber: data.get("classNumber"),
                  enrolledOn: data.get("enrolledOn"),
                }),
              );
            }}
          >
            <h3 className="font-bold">Update current enrolment</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="current-enrollment-number">Class number</Label>
                <Input
                  id="current-enrollment-number"
                  name="classNumber"
                  defaultValue={current.class_number ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="current-enrollment-date">Enrolled on</Label>
                <Input
                  id="current-enrollment-date"
                  name="enrolledOn"
                  type="date"
                  defaultValue={current.enrolled_on}
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              variant="secondary"
              loading={mutation.pending}
            >
              Save enrolment details
            </Button>
          </form>
          <form
            className="grid gap-4 border-t pt-5"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              mutation.run(() =>
                moveStudentClass({
                  enrollmentId: current.enrollment_id,
                  expectedUpdatedAt: current.updated_at,
                  classSectionId: data.get("classSectionId"),
                  classNumber: data.get("classNumber"),
                  capacityOverride: data.get("capacityOverride") === "on",
                  capacityOverrideReason: data.get("capacityOverrideReason"),
                }),
              );
            }}
          >
            <h3 className="font-bold">
              Move within {current.academic_year_name}
            </h3>
            <div>
              <Label htmlFor="move-class">Destination class</Label>
              <select
                id="move-class"
                name="classSectionId"
                className={selectClass}
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
                required
              >
                <option value="">Choose a destination</option>
                {classes
                  .filter(
                    (item) =>
                      item.academic_year_id === current.academic_year_id &&
                      item.id !== current.class_section_id,
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.class_code}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label htmlFor="move-class-number">New class number</Label>
              <Input id="move-class-number" name="classNumber" />
            </div>
            {selectedClass?.capacity ? (
              <p
                className={`rounded-lg p-3 text-sm ${atCapacity ? "bg-warning-soft text-warning-strong" : "bg-surface-muted text-muted-foreground"}`}
              >
                {selectedClass.activeCount} of {selectedClass.capacity} places
                used.
              </p>
            ) : null}
            {atCapacity && canOverrideCapacity ? (
              <>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" name="capacityOverride" />
                  Approve capacity override
                </label>
                <div>
                  <Label htmlFor="move-capacity-reason">Override reason</Label>
                  <Input
                    id="move-capacity-reason"
                    name="capacityOverrideReason"
                  />
                </div>
              </>
            ) : null}
            <Button
              type="submit"
              loading={mutation.pending}
              disabled={!destinations.length}
            >
              Move class
            </Button>
          </form>
          <form
            className="grid gap-4 border-t pt-5"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              mutation.run(() =>
                changeEnrollmentStatus({
                  enrollmentId: current.enrollment_id,
                  expectedUpdatedAt: current.updated_at,
                  targetStatus: data.get("status"),
                  exitedOn: data.get("exitedOn"),
                  reason: data.get("reason"),
                }),
              );
            }}
          >
            <h3 className="font-bold">Change enrolment status</h3>
            <div>
              <Label htmlFor="enrollment-target-status">New status</Label>
              <select
                id="enrollment-target-status"
                name="status"
                className={selectClass}
              >
                <option
                  value={current.status === "ACTIVE" ? "REPEATING" : "ACTIVE"}
                >
                  {current.status === "ACTIVE" ? "Repeating" : "Active"}
                </option>
                <option value="TRANSFERRED">Transferred</option>
                <option value="WITHDRAWN">Withdrawn</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
            <div>
              <Label htmlFor="exit-date">Exit date for terminal status</Label>
              <Input id="exit-date" name="exitedOn" type="date" />
            </div>
            <div>
              <Label htmlFor="enrollment-reason">
                Reason for terminal status
              </Label>
              <textarea
                id="enrollment-reason"
                name="reason"
                className={textareaClass}
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              loading={mutation.pending}
            >
              Update enrolment status
            </Button>
          </form>
        </>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            mutation.run(() =>
              createStudentEnrollment({
                studentId: student.student_id,
                academicYearId: data.get("academicYearId"),
                classSectionId: data.get("classSectionId"),
                classNumber: data.get("classNumber"),
                status: data.get("status"),
                enrolledOn: data.get("enrolledOn"),
                capacityOverride: data.get("capacityOverride") === "on",
                capacityOverrideReason: data.get("capacityOverrideReason"),
              }),
            );
          }}
        >
          <h3 className="font-bold">Create enrolment</h3>
          <div>
            <Label htmlFor="new-enrollment-year">Academic year</Label>
            <select
              id="new-enrollment-year"
              name="academicYearId"
              className={selectClass}
              value={yearId}
              onChange={(event) => {
                setYearId(event.target.value);
                setClassId("");
              }}
              required
            >
              <option value="">Choose a year</option>
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
            <Label htmlFor="new-enrollment-class">Class</Label>
            <select
              id="new-enrollment-class"
              name="classSectionId"
              className={selectClass}
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              required
            >
              <option value="">Choose a class</option>
              {classes
                .filter((item) => item.academic_year_id === yearId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.class_code}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="new-enrollment-number">Class number</Label>
              <Input id="new-enrollment-number" name="classNumber" />
            </div>
            <div>
              <Label htmlFor="new-enrollment-status">Status</Label>
              <select
                id="new-enrollment-status"
                name="status"
                className={selectClass}
              >
                <option value="ACTIVE">Active</option>
                <option value="REPEATING">Repeating (explicit)</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="new-enrollment-date">Enrolled on</Label>
            <Input
              id="new-enrollment-date"
              name="enrolledOn"
              type="date"
              defaultValue={today}
              required
            />
          </div>
          {selectedClass?.capacity ? (
            <p
              className={`rounded-lg p-3 text-sm ${atCapacity ? "bg-warning-soft text-warning-strong" : "bg-surface-muted text-muted-foreground"}`}
            >
              {selectedClass.activeCount} of {selectedClass.capacity} places
              used.
            </p>
          ) : null}
          {atCapacity && canOverrideCapacity ? (
            <>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="capacityOverride" />
                Approve capacity override
              </label>
              <div>
                <Label htmlFor="new-capacity-reason">Override reason</Label>
                <Input id="new-capacity-reason" name="capacityOverrideReason" />
              </div>
            </>
          ) : null}
          <Button type="submit" loading={mutation.pending}>
            Create enrolment
          </Button>
        </form>
      )}
    </div>
  );
}

export function GuardianManager({
  studentId,
  guardians,
}: {
  studentId: string;
  guardians: GuardianRow[];
}) {
  const mutation = useMutationResult();
  return (
    <div className="grid gap-5">
      <ResultMessage result={mutation.result} />
      {guardians.map((guardian) => (
        <div
          key={guardian.relationship_id}
          className="bg-surface-muted grid gap-3 rounded-lg p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">
              {guardian.first_name} {guardian.middle_name} {guardian.last_name}
            </p>
            <div className="flex gap-2">
              {guardian.is_primary ? (
                <Badge variant="success">Primary</Badge>
              ) : null}
              {!guardian.guardian_is_active ? (
                <Badge variant="warning">Inactive</Badge>
              ) : null}
            </div>
          </div>
          <p className="text-muted-foreground text-sm">
            {guardian.phone ?? "No phone"} · {guardian.email ?? "No email"}
          </p>
          <form
            className="grid gap-3 border-t pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              mutation.run(() =>
                updateGuardian({
                  guardianId: guardian.guardian_id,
                  expectedUpdatedAt: guardian.guardian_updated_at,
                  firstName: data.get("firstName"),
                  middleName: data.get("middleName"),
                  lastName: data.get("lastName"),
                  phone: data.get("phone"),
                  email: data.get("email"),
                  isActive: data.get("isActive") === "on",
                }),
              );
            }}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor={`guardian-first-${guardian.guardian_id}`}>
                  First name
                </Label>
                <Input
                  id={`guardian-first-${guardian.guardian_id}`}
                  name="firstName"
                  defaultValue={guardian.first_name}
                  required
                />
              </div>
              <div>
                <Label htmlFor={`guardian-middle-${guardian.guardian_id}`}>
                  Middle name
                </Label>
                <Input
                  id={`guardian-middle-${guardian.guardian_id}`}
                  name="middleName"
                  defaultValue={guardian.middle_name ?? ""}
                />
              </div>
              <div>
                <Label htmlFor={`guardian-last-${guardian.guardian_id}`}>
                  Last name
                </Label>
                <Input
                  id={`guardian-last-${guardian.guardian_id}`}
                  name="lastName"
                  defaultValue={guardian.last_name}
                  required
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={`guardian-phone-${guardian.guardian_id}`}>
                  Phone (E.164)
                </Label>
                <Input
                  id={`guardian-phone-${guardian.guardian_id}`}
                  name="phone"
                  type="tel"
                  defaultValue={guardian.phone ?? ""}
                />
              </div>
              <div>
                <Label htmlFor={`guardian-email-${guardian.guardian_id}`}>
                  Email
                </Label>
                <Input
                  id={`guardian-email-${guardian.guardian_id}`}
                  name="email"
                  type="email"
                  defaultValue={guardian.email ?? ""}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={guardian.guardian_is_active}
              />
              Active guardian record
            </label>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              loading={mutation.pending}
            >
              Save guardian details
            </Button>
          </form>
          <form
            className="grid gap-3 border-t pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              mutation.run(() =>
                updateGuardianRelationship({
                  relationshipId: guardian.relationship_id,
                  expectedUpdatedAt: guardian.relationship_updated_at,
                  relationship: data.get("relationship"),
                  isPrimary: data.get("isPrimary") === "on",
                  canAccessReports: data.get("canAccessReports") === "on",
                }),
              );
            }}
          >
            <div>
              <Label htmlFor={`relationship-${guardian.relationship_id}`}>
                Relationship
              </Label>
              <Input
                id={`relationship-${guardian.relationship_id}`}
                name="relationship"
                defaultValue={guardian.relationship}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isPrimary"
                defaultChecked={guardian.is_primary}
              />
              Primary guardian
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="canAccessReports"
                defaultChecked={guardian.can_access_reports}
              />
              Eligible for future report access
            </label>
            <p className="text-muted-foreground text-xs">
              Eligibility does not create a login, credential, session, or
              current report access.
            </p>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              loading={mutation.pending}
            >
              Save relationship
            </Button>
          </form>
          <form
            className="grid gap-2 border-t pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              mutation.run(() =>
                unlinkGuardian({
                  relationshipId: guardian.relationship_id,
                  expectedUpdatedAt: guardian.relationship_updated_at,
                  reason: data.get("unlinkReason"),
                }),
              );
            }}
          >
            <Label htmlFor={`unlink-reason-${guardian.relationship_id}`}>
              Reason for unlinking
            </Label>
            <Input
              id={`unlink-reason-${guardian.relationship_id}`}
              name="unlinkReason"
              minLength={3}
              required
            />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              loading={mutation.pending}
            >
              Unlink guardian
            </Button>
          </form>
        </div>
      ))}
      <form
        className="grid gap-4 border-t pt-5"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          mutation.run(async () => {
            const next = await createAndLinkGuardian({
              studentId,
              firstName: data.get("firstName"),
              middleName: data.get("middleName"),
              lastName: data.get("lastName"),
              phone: data.get("phone"),
              email: data.get("email"),
              relationship: data.get("relationship"),
              isPrimary: data.get("isPrimary") === "on",
              canAccessReports: data.get("canAccessReports") === "on",
            });
            if (next.ok) form.reset();
            return next;
          });
        }}
      >
        <div className="flex items-center gap-2">
          <UserRoundPlus className="text-primary size-5" aria-hidden="true" />
          <h3 className="font-bold">Add a guardian</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="guardian-add-first">First name</Label>
            <Input id="guardian-add-first" name="firstName" required />
          </div>
          <div>
            <Label htmlFor="guardian-add-middle">Middle name</Label>
            <Input id="guardian-add-middle" name="middleName" />
          </div>
          <div>
            <Label htmlFor="guardian-add-last">Last name</Label>
            <Input id="guardian-add-last" name="lastName" required />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="guardian-add-phone">Phone (E.164)</Label>
            <Input
              id="guardian-add-phone"
              name="phone"
              type="tel"
              placeholder="+256…"
            />
          </div>
          <div>
            <Label htmlFor="guardian-add-email">Email</Label>
            <Input id="guardian-add-email" name="email" type="email" />
          </div>
        </div>
        <div>
          <Label htmlFor="guardian-add-relationship">Relationship</Label>
          <Input
            id="guardian-add-relationship"
            name="relationship"
            defaultValue="Guardian"
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPrimary" />
          Make primary guardian
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="canAccessReports" />
          Eligible for future report access
        </label>
        <Button type="submit" loading={mutation.pending}>
          Add guardian
        </Button>
      </form>
    </div>
  );
}

export function PhotoForm({ student }: { student: StudentDetail }) {
  const mutation = useMutationResult();
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        data.set("studentId", student.student_id);
        data.set("expectedUpdatedAt", student.updated_at);
        mutation.run(() => uploadStudentPhoto(data));
      }}
      encType="multipart/form-data"
    >
      <ResultMessage result={mutation.result} />
      <div className="bg-primary-soft text-primary flex size-11 items-center justify-center rounded-lg">
        <Camera aria-hidden="true" className="size-5" />
      </div>
      <div>
        <Label htmlFor="student-photo">Private student photo</Label>
        <Input
          id="student-photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
        />
        <p className="text-muted-foreground mt-2 text-xs">
          JPEG, PNG, or WebP. Maximum 5 MB. The file signature is checked before
          upload.
        </p>
      </div>
      <div className="text-muted-foreground flex items-start gap-2 text-xs">
        <ShieldCheck
          aria-hidden="true"
          className="text-primary size-4 shrink-0"
        />
        <p>
          Stored in a private, school-and-student-scoped path. The database
          stores only the object path, never a public URL.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={mutation.pending}>
          {student.photo_storage_path ? "Replace photo" : "Upload photo"}
        </Button>
        {student.photo_storage_path ? (
          <Button
            type="button"
            variant="ghost"
            loading={mutation.pending}
            onClick={() =>
              mutation.run(() =>
                removeStudentPhoto({
                  studentId: student.student_id,
                  expectedUpdatedAt: student.updated_at,
                }),
              )
            }
          >
            Remove photo
          </Button>
        ) : null}
      </div>
    </form>
  );
}
