"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database.generated";

import {
  admissionSchema,
  classMoveSchema,
  enrollmentSchema,
  enrollmentStatusSchema,
  enrollmentUpdateSchema,
  guardianLinkSchema,
  guardianSchema,
  relationshipUpdateSchema,
  studentProfileSchema,
  studentStatusSchema,
} from "./schemas";

export type StudentActionResult =
  | { ok: true; message: string; studentId?: string; guardianId?: string }
  | { ok: false; message: string; conflict?: boolean };

type Functions = Database["public"]["Functions"];
type FunctionName = keyof Functions;
type FunctionArgs<Name extends FunctionName> = Functions[Name]["Args"];

const nullableString = null as unknown as string;

function failed(message: string, conflict = false): StudentActionResult {
  return { ok: false, message, ...(conflict ? { conflict: true } : {}) };
}

function firstIssue(parsed: {
  success: false;
  error: { issues: { message: string }[] };
}) {
  return failed(
    parsed.error.issues[0]?.message ?? "Review the submitted values.",
  );
}

function mutationError(error: { code?: string; message: string }) {
  if (
    error.code === "PT409" ||
    error.message.includes("STUDENT_MANAGEMENT_CONFLICT")
  ) {
    return failed(
      "This record changed elsewhere. Refresh and try again.",
      true,
    );
  }
  if (error.code === "42501") {
    if (error.message.includes("CAPACITY_OVERRIDE"))
      return failed(
        "Only a school administrator can approve a capacity override.",
      );
    return failed("You no longer have permission to make this change.");
  }
  if (error.code === "23505") {
    if (error.message.includes("admission"))
      return failed("That admission number is already in use in this school.");
    if (error.message.includes("class_number"))
      return failed("That class number is already assigned in this class.");
    if (error.message.includes("primary_guardian"))
      return failed("This student already has a primary guardian.");
    return failed(
      "This record conflicts with an existing student-management record.",
    );
  }
  if (error.message.includes("CLASS_CAPACITY_REACHED"))
    return failed(
      "This class is at capacity. A school administrator must provide an override reason.",
    );
  if (error.message.includes("STUDENT_STATUS_NOT_ENROLLABLE"))
    return failed(
      "Reactivate this student through the lifecycle workflow before creating an enrolment.",
    );
  if (error.message.includes("STUDENT_PHOTO_OBJECT_NOT_FOUND"))
    return failed("The uploaded private photo object could not be found.");
  if (error.message.includes("ENROLLMENT_HAS_ACADEMIC_DEPENDENCIES"))
    return failed(
      "This placement already has academic history and cannot be moved.",
    );
  if (error.message.includes("YEAR_UNAVAILABLE"))
    return failed("That academic year is closed or unavailable for enrolment.");
  if (error.message.includes("CLASS_UNAVAILABLE"))
    return failed("Choose an active class in the selected academic year.");
  if (error.message.includes("STATUS_TRANSITION"))
    return failed("That lifecycle transition is not allowed.");
  if (error.message.includes("NOOP"))
    return failed("Choose a different value before saving.");
  if (
    error.code === "23514" ||
    error.code === "22023" ||
    error.code === "55006"
  ) {
    return failed(
      "The change is not valid for this student’s current academic or lifecycle state.",
    );
  }
  return failed(
    "The student-management change could not be saved. Review the values and try again.",
  );
}

async function runMutation<Name extends FunctionName>(
  name: Name,
  args: FunctionArgs<Name>,
  message: string,
) {
  await requirePermission("STUDENTS_MANAGE");
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc(name, args);
  if (result.error) {
    console.error("Student-management mutation failed.", {
      code: result.error.code,
      operation: name,
    });
    return { result: mutationError(result.error), data: null };
  }
  revalidatePath("/dashboard/students");
  return {
    result: { ok: true, message } as StudentActionResult,
    data: result.data,
  };
}

export async function admitStudent(
  input: unknown,
): Promise<StudentActionResult> {
  const parsed = admissionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  const guardianStarted = Boolean(
    parsed.data.guardianFirstName && parsed.data.guardianLastName,
  );
  const { result, data } = await runMutation(
    "admit_student",
    {
      admission_number: parsed.data.admissionNumber,
      first_name: parsed.data.firstName,
      middle_name: parsed.data.middleName ?? nullableString,
      last_name: parsed.data.lastName,
      gender: parsed.data.gender ?? nullableString,
      date_of_birth: parsed.data.dateOfBirth ?? nullableString,
      admission_date: parsed.data.admissionDate,
      initial_academic_year_id: parsed.data.academicYearId ?? nullableString,
      initial_class_section_id: parsed.data.classSectionId ?? nullableString,
      class_number: parsed.data.classNumber ?? nullableString,
      enrollment_status: parsed.data.enrollmentStatus,
      capacity_override: parsed.data.capacityOverride,
      capacity_override_reason:
        parsed.data.capacityOverrideReason ?? nullableString,
      first_guardian: guardianStarted
        ? ({
            first_name: parsed.data.guardianFirstName,
            middle_name: parsed.data.guardianMiddleName,
            last_name: parsed.data.guardianLastName,
            phone: parsed.data.guardianPhone,
            email: parsed.data.guardianEmail,
            relationship: parsed.data.guardianRelationship ?? "Guardian",
            is_primary: true,
            can_access_reports: false,
          } satisfies Json)
        : (null as unknown as Json),
    },
    "Student admitted successfully.",
  );
  if (!result.ok || !data?.[0]) return result;
  return { ...result, studentId: data[0].student_id };
}

export async function updateStudentProfile(
  input: unknown,
): Promise<StudentActionResult> {
  const parsed = studentProfileSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return (
    await runMutation(
      "update_student_profile",
      {
        target_student_id: parsed.data.studentId,
        expected_updated_at: parsed.data.expectedUpdatedAt,
        admission_number: parsed.data.admissionNumber,
        first_name: parsed.data.firstName,
        middle_name: parsed.data.middleName ?? nullableString,
        last_name: parsed.data.lastName,
        gender: parsed.data.gender ?? nullableString,
        date_of_birth: parsed.data.dateOfBirth ?? nullableString,
        admission_date: parsed.data.admissionDate,
      },
      "Student profile updated.",
    )
  ).result;
}

export async function changeStudentStatus(
  input: unknown,
): Promise<StudentActionResult> {
  const parsed = studentStatusSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return (
    await runMutation(
      "change_student_status",
      {
        target_student_id: parsed.data.studentId,
        expected_updated_at: parsed.data.expectedUpdatedAt,
        target_status: parsed.data.targetStatus,
        effective_date: parsed.data.effectiveDate,
        reason: parsed.data.reason,
      },
      "Student status updated.",
    )
  ).result;
}

export async function createStudentEnrollment(
  input: unknown,
): Promise<StudentActionResult> {
  const parsed = enrollmentSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return (
    await runMutation(
      "create_student_enrollment",
      {
        target_student_id: parsed.data.studentId,
        target_academic_year_id: parsed.data.academicYearId,
        target_class_section_id: parsed.data.classSectionId,
        class_number: parsed.data.classNumber ?? nullableString,
        enrollment_status: parsed.data.status,
        enrolled_on: parsed.data.enrolledOn,
        capacity_override: parsed.data.capacityOverride,
        capacity_override_reason:
          parsed.data.capacityOverrideReason ?? nullableString,
      },
      "Enrolment created.",
    )
  ).result;
}

export async function updateStudentEnrollment(
  input: unknown,
): Promise<StudentActionResult> {
  const parsed = enrollmentUpdateSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return (
    await runMutation(
      "update_student_enrollment",
      {
        target_enrollment_id: parsed.data.enrollmentId,
        expected_updated_at: parsed.data.expectedUpdatedAt,
        class_number: parsed.data.classNumber ?? nullableString,
        enrolled_on: parsed.data.enrolledOn,
      },
      "Enrolment details updated.",
    )
  ).result;
}

export async function moveStudentClass(
  input: unknown,
): Promise<StudentActionResult> {
  const parsed = classMoveSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return (
    await runMutation(
      "move_student_class",
      {
        target_enrollment_id: parsed.data.enrollmentId,
        expected_updated_at: parsed.data.expectedUpdatedAt,
        target_class_section_id: parsed.data.classSectionId,
        class_number: parsed.data.classNumber ?? nullableString,
        capacity_override: parsed.data.capacityOverride,
        capacity_override_reason:
          parsed.data.capacityOverrideReason ?? nullableString,
      },
      "Student moved to the new class.",
    )
  ).result;
}

export async function changeEnrollmentStatus(
  input: unknown,
): Promise<StudentActionResult> {
  const parsed = enrollmentStatusSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return (
    await runMutation(
      "change_enrollment_status",
      {
        target_enrollment_id: parsed.data.enrollmentId,
        expected_updated_at: parsed.data.expectedUpdatedAt,
        target_status: parsed.data.targetStatus,
        exited_on: parsed.data.exitedOn ?? nullableString,
        reason: parsed.data.reason ?? nullableString,
      },
      "Enrolment status updated.",
    )
  ).result;
}

export async function createGuardian(
  input: unknown,
): Promise<StudentActionResult> {
  const parsed = guardianSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  const { result, data } = await runMutation(
    "create_guardian",
    {
      first_name: parsed.data.firstName,
      middle_name: parsed.data.middleName ?? nullableString,
      last_name: parsed.data.lastName,
      phone: parsed.data.phone ?? nullableString,
      email: parsed.data.email ?? nullableString,
    },
    "Guardian created.",
  );
  if (!result.ok || !data?.[0]) return result;
  return { ...result, guardianId: data[0].guardian_id };
}

export async function createAndLinkGuardian(
  input: unknown,
): Promise<StudentActionResult> {
  const parsedGuardian = guardianSchema.safeParse(input);
  const linkInput = input as Record<string, unknown>;
  const parsedLink = guardianLinkSchema.omit({ guardianId: true }).safeParse({
    studentId: linkInput.studentId,
    relationship: linkInput.relationship,
    isPrimary: linkInput.isPrimary,
    canAccessReports: linkInput.canAccessReports,
  });
  if (!parsedGuardian.success) return firstIssue(parsedGuardian);
  if (!parsedLink.success) return firstIssue(parsedLink);
  const { result, data } = await runMutation(
    "create_and_link_guardian",
    {
      target_student_id: parsedLink.data.studentId,
      first_name: parsedGuardian.data.firstName,
      middle_name: parsedGuardian.data.middleName ?? nullableString,
      last_name: parsedGuardian.data.lastName,
      phone: parsedGuardian.data.phone ?? nullableString,
      email: parsedGuardian.data.email ?? nullableString,
      relationship: parsedLink.data.relationship,
      primary_guardian: parsedLink.data.isPrimary,
      report_access_eligible: parsedLink.data.canAccessReports,
    },
    "Guardian added to the student.",
  );
  if (!result.ok || !data?.[0]) return result;
  return { ...result, guardianId: data[0].guardian_id };
}

export async function updateGuardian(
  input: unknown,
): Promise<StudentActionResult> {
  const record = input as Record<string, unknown>;
  const parsed = guardianSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  if (
    typeof record.guardianId !== "string" ||
    typeof record.expectedUpdatedAt !== "string" ||
    typeof record.isActive !== "boolean"
  ) {
    return failed("The guardian record is incomplete.");
  }
  return (
    await runMutation(
      "update_guardian",
      {
        target_guardian_id: record.guardianId,
        expected_updated_at: record.expectedUpdatedAt,
        first_name: parsed.data.firstName,
        middle_name: parsed.data.middleName ?? nullableString,
        last_name: parsed.data.lastName,
        phone: parsed.data.phone ?? nullableString,
        email: parsed.data.email ?? nullableString,
        target_is_active: record.isActive,
      },
      "Guardian details updated.",
    )
  ).result;
}

export async function linkGuardian(
  input: unknown,
): Promise<StudentActionResult> {
  const parsed = guardianLinkSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return (
    await runMutation(
      "link_guardian_to_student",
      {
        target_student_id: parsed.data.studentId,
        target_guardian_id: parsed.data.guardianId,
        relationship: parsed.data.relationship,
        primary_guardian: parsed.data.isPrimary,
        report_access_eligible: parsed.data.canAccessReports,
      },
      "Guardian linked to student.",
    )
  ).result;
}

export async function updateGuardianRelationship(
  input: unknown,
): Promise<StudentActionResult> {
  const parsed = relationshipUpdateSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return (
    await runMutation(
      "update_student_guardian_relationship",
      {
        target_relationship_id: parsed.data.relationshipId,
        expected_updated_at: parsed.data.expectedUpdatedAt,
        relationship: parsed.data.relationship,
        primary_guardian: parsed.data.isPrimary,
        report_access_eligible: parsed.data.canAccessReports,
      },
      "Guardian relationship updated.",
    )
  ).result;
}

export async function unlinkGuardian(
  input: unknown,
): Promise<StudentActionResult> {
  const record = input as Record<string, unknown>;
  if (
    typeof record.relationshipId !== "string" ||
    typeof record.expectedUpdatedAt !== "string" ||
    typeof record.reason !== "string" ||
    record.reason.trim().length < 3
  ) {
    return failed("Enter a reason before unlinking this guardian.");
  }
  return (
    await runMutation(
      "unlink_guardian_from_student",
      {
        target_relationship_id: record.relationshipId,
        expected_updated_at: record.expectedUpdatedAt,
        reason: record.reason.trim(),
      },
      "Guardian unlinked from the student.",
    )
  ).result;
}

function validImageSignature(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png")
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    );
  if (type === "image/webp")
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  return false;
}

export async function uploadStudentPhoto(
  formData: FormData,
): Promise<StudentActionResult> {
  const context = await requirePermission("STUDENTS_MANAGE");
  const studentId = String(formData.get("studentId") ?? "");
  const expectedUpdatedAt = String(formData.get("expectedUpdatedAt") ?? "");
  const file = formData.get("photo");
  if (
    !zodUuid(studentId) ||
    !zodTimestamp(expectedUpdatedAt) ||
    !(file instanceof File)
  )
    return failed("Choose a student photo to upload.");
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size < 1 ||
    file.size > 5 * 1024 * 1024
  )
    return failed("Use a JPEG, PNG, or WebP image no larger than 5 MB.");
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!validImageSignature(bytes, file.type))
    return failed("The file contents do not match a supported image type.");
  const extension =
    file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `${context.activeSchoolId}/${studentId}/${randomUUID()}.${extension}`;
  const supabase = await createServerSupabaseClient();
  const existing = await supabase.rpc("get_student_details", {
    target_student_id: studentId,
  });
  if (existing.error || !existing.data?.[0])
    return failed("The student photo could not be updated.");
  const previousPath = existing.data[0].photo_storage_path;
  const upload = await supabase.storage
    .from("student-photos")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error)
    return failed("The private photo upload failed. Try again.");
  const linked = await supabase.rpc("set_student_photo_path", {
    target_student_id: studentId,
    expected_updated_at: expectedUpdatedAt,
    photo_storage_path: path,
  });
  if (linked.error) {
    await supabase.storage.from("student-photos").remove([path]);
    return mutationError(linked.error);
  }
  if (previousPath && previousPath !== path) {
    const cleanup = await supabase.storage
      .from("student-photos")
      .remove([previousPath]);
    if (cleanup.error)
      console.error("Previous private student photo cleanup failed.", {
        code: cleanup.error.name,
      });
  }
  revalidatePath(`/dashboard/students/${studentId}`);
  return { ok: true, message: "Student photo updated." };
}

export async function removeStudentPhoto(
  input: unknown,
): Promise<StudentActionResult> {
  await requirePermission("STUDENTS_MANAGE");
  const record = input as Record<string, unknown>;
  if (
    typeof record.studentId !== "string" ||
    !zodUuid(record.studentId) ||
    typeof record.expectedUpdatedAt !== "string" ||
    !zodTimestamp(record.expectedUpdatedAt)
  )
    return failed("The student photo record is incomplete.");

  const supabase = await createServerSupabaseClient();
  const existing = await supabase.rpc("get_student_details", {
    target_student_id: record.studentId,
  });
  if (existing.error || !existing.data?.[0]?.photo_storage_path)
    return failed("This student does not have a photo to remove.");
  const previousPath = existing.data[0].photo_storage_path;
  const unlinked = await supabase.rpc("set_student_photo_path", {
    target_student_id: record.studentId,
    expected_updated_at: record.expectedUpdatedAt,
    photo_storage_path: "",
  });
  if (unlinked.error) return mutationError(unlinked.error);

  const cleanup = await supabase.storage
    .from("student-photos")
    .remove([previousPath]);
  if (cleanup.error) {
    console.error("Private student photo cleanup failed.", {
      code: cleanup.error.name,
    });
  }
  revalidatePath(`/dashboard/students/${record.studentId}`);
  return {
    ok: true,
    message: cleanup.error
      ? "Photo removed from the profile; private storage cleanup needs retrying."
      : "Student photo removed.",
  };
}

function zodUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
function zodTimestamp(value: string) {
  return !Number.isNaN(Date.parse(value));
}
