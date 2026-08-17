import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AppPermission } from "../../src/lib/authorization/permissions";
import type { Database } from "../../src/types/database.generated";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL!;
const password = "synthetic-authorization-password";
const nonce = Date.now();

const admin = createClient<Database>(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});
const localDatabase = new Client({ connectionString: databaseUrl });

const fixtureTables = [
  "academic_years",
  "terms",
  "grade_levels",
  "class_sections",
  "subjects",
  "students",
  "enrollments",
  "teaching_assignments",
  "class_teacher_assignments",
  "assessment_schemes",
  "assessment_components",
  "mark_sheets",
  "marks",
];

type Role = Database["public"]["Enums"]["staff_role"];
type TestIdentity = {
  email: string;
  userId: string;
  membershipId: string;
};

const identities = new Map<string, TestIdentity>();
const userIds: string[] = [];
const schoolA = randomUUID();
const schoolB = randomUUID();
const yearA = randomUUID();
const yearB = randomUUID();
const termA = randomUUID();
const termB = randomUUID();
const gradeA = randomUUID();
const gradeB = randomUUID();
const classA1 = randomUUID();
const classA2 = randomUUID();
const classB1 = randomUUID();
const subjectA1 = randomUUID();
const subjectA2 = randomUUID();
const subjectB1 = randomUUID();
const studentA1 = randomUUID();
const studentA2 = randomUUID();
const studentB1 = randomUUID();
const enrollmentA1 = randomUUID();
const enrollmentA2 = randomUUID();
const enrollmentAWithdrawn = randomUUID();
const enrollmentATransferred = randomUUID();
const enrollmentACompleted = randomUUID();
const enrollmentB1 = randomUUID();
const teachingA1 = randomUUID();
const teachingA2 = randomUUID();
const teachingA3 = randomUUID();
const teachingB1 = randomUUID();
const classTeacherA1 = randomUUID();
const schemeA1 = randomUUID();
const schemeA2 = randomUUID();
const schemeB1 = randomUUID();
const componentA1 = randomUUID();
const componentA2 = randomUUID();
const componentB1 = randomUUID();
const sheetA1 = randomUUID();
const sheetA2 = randomUUID();
const sheetA3 = randomUUID();
const sheetB1 = randomUUID();

function expectSuccess(error: { message: string } | null) {
  if (error) throw error;
}

async function createIdentity(
  key: string,
  role: Role,
  schoolId = schoolA,
  revoked = false,
) {
  const email = `authorization.${key}.${nonce}@example.invalid`;
  const authResult = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expectSuccess(authResult.error);
  const userId = authResult.data.user!.id;
  const membershipId = randomUUID();
  userIds.push(userId);

  expectSuccess(
    (
      await admin.from("profiles").insert({
        id: userId,
        first_name: "Synthetic",
        last_name: "Authorization",
      })
    ).error,
  );
  expectSuccess(
    (
      await admin.from("school_staff_memberships").insert({
        id: membershipId,
        school_id: schoolId,
        profile_id: userId,
        employee_number: `AUTHZ-${key}-${nonce}`,
        status: "ACTIVE",
      })
    ).error,
  );
  expectSuccess(
    (
      await admin.from("staff_role_assignments").insert({
        membership_id: membershipId,
        role,
        granted_at: revoked
          ? new Date(Date.now() - 1_000).toISOString()
          : undefined,
        revoked_at: revoked ? new Date().toISOString() : null,
      })
    ).error,
  );
  identities.set(key, { email, userId, membershipId });
}

async function signedInClient(key: string) {
  const identity = identities.get(key)!;
  const client = createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { error } = await client.auth.signInWithPassword({
    email: identity.email,
    password,
  });
  expectSuccess(error);
  return client;
}

async function permissions(
  client: SupabaseClient<Database>,
  membershipId: string,
) {
  const { data, error } = await client.rpc("get_my_effective_permissions", {
    target_membership_id: membershipId,
  });
  expectSuccess(error);
  return new Set(data ?? []);
}

async function selectMembership(
  client: SupabaseClient<Database>,
  membershipId: string,
) {
  const { data, error } = await client.rpc("set_my_active_membership", {
    target_membership_id: membershipId,
  });
  expectSuccess(error);
  expect(data).toBe(membershipId);
}

describe.sequential("local school-scoped authorization integration", () => {
  beforeAll(async () => {
    await localDatabase.connect();
    await localDatabase.query(
      `grant select, insert, update, delete on table ${fixtureTables
        .map((table) => `public.${table}`)
        .join(", ")} to service_role`,
    );
    await localDatabase.query(
      "grant insert, update, delete on table public.schools to service_role",
    );
    await localDatabase.query(
      "grant execute on function internal.assessment_scheme_weight_total(uuid) to service_role",
    );

    expectSuccess(
      (
        await admin.from("schools").insert([
          {
            id: schoolA,
            name: "Synthetic Authorization School A",
            slug: `synthetic-authorization-a-${nonce}`,
            school_code: `AUTHZ-A-${nonce}`,
          },
          {
            id: schoolB,
            name: "Synthetic Authorization School B",
            slug: `synthetic-authorization-b-${nonce}`,
            school_code: `AUTHZ-B-${nonce}`,
          },
        ])
      ).error,
    );

    await createIdentity("super", "SUPER_ADMIN");
    await createIdentity("school-admin", "SCHOOL_ADMIN");
    await createIdentity("head", "HEAD_TEACHER");
    await createIdentity("registrar", "ACADEMIC_REGISTRAR");
    await createIdentity("class", "CLASS_TEACHER");
    await createIdentity("subject", "SUBJECT_TEACHER");
    await createIdentity("revoked", "SUBJECT_TEACHER", schoolA, true);
    await createIdentity("unassigned", "SUBJECT_TEACHER");
    await createIdentity("multi", "SCHOOL_ADMIN");

    const multi = identities.get("multi")!;
    const membershipB = randomUUID();
    expectSuccess(
      (
        await admin.from("school_staff_memberships").insert({
          id: membershipB,
          school_id: schoolB,
          profile_id: multi.userId,
          employee_number: `AUTHZ-MULTI-B-${nonce}`,
          status: "ACTIVE",
        })
      ).error,
    );
    expectSuccess(
      (
        await admin.from("staff_role_assignments").insert({
          membership_id: membershipB,
          role: "SUBJECT_TEACHER",
        })
      ).error,
    );
    identities.set("multi-school-b", { ...multi, membershipId: membershipB });

    expectSuccess(
      (
        await admin.from("academic_years").insert([
          {
            id: yearA,
            school_id: schoolA,
            name: `Synthetic A ${nonce}`,
            starts_on: "2026-02-01",
            ends_on: "2026-12-05",
            status: "ACTIVE",
          },
          {
            id: yearB,
            school_id: schoolB,
            name: `Synthetic B ${nonce}`,
            starts_on: "2026-02-01",
            ends_on: "2026-12-05",
            status: "ACTIVE",
          },
        ])
      ).error,
    );
    expectSuccess(
      (
        await admin.from("terms").insert([
          {
            id: termA,
            academic_year_id: yearA,
            name: "Synthetic Authorization Term",
            term_number: 1,
            starts_on: "2026-05-25",
            ends_on: "2026-08-28",
            status: "MARKS_ENTRY",
          },
          {
            id: termB,
            academic_year_id: yearB,
            name: "Synthetic Authorization Term",
            term_number: 1,
            starts_on: "2026-05-25",
            ends_on: "2026-08-28",
            status: "MARKS_ENTRY",
          },
        ])
      ).error,
    );
    expectSuccess(
      (
        await admin.from("grade_levels").insert([
          {
            id: gradeA,
            school_id: schoolA,
            code: "P1",
            name: "Primary One",
            sort_order: 1,
          },
          {
            id: gradeB,
            school_id: schoolB,
            code: "P1",
            name: "Primary One",
            sort_order: 1,
          },
        ])
      ).error,
    );
    expectSuccess(
      (
        await admin.from("class_sections").insert([
          {
            id: classA1,
            academic_year_id: yearA,
            grade_level_id: gradeA,
            name: "Assigned",
            class_code: "A1",
          },
          {
            id: classA2,
            academic_year_id: yearA,
            grade_level_id: gradeA,
            name: "Other",
            class_code: "A2",
          },
          {
            id: classB1,
            academic_year_id: yearB,
            grade_level_id: gradeB,
            name: "Assigned",
            class_code: "B1",
          },
        ])
      ).error,
    );
    expectSuccess(
      (
        await admin.from("subjects").insert([
          {
            id: subjectA1,
            school_id: schoolA,
            code: "ENG",
            name: "English",
            sort_order: 1,
          },
          {
            id: subjectA2,
            school_id: schoolA,
            code: "MATH",
            name: "Mathematics",
            sort_order: 2,
          },
          {
            id: subjectB1,
            school_id: schoolB,
            code: "ENG",
            name: "English",
            sort_order: 1,
          },
        ])
      ).error,
    );
    expectSuccess(
      (
        await admin.from("students").insert([
          {
            id: studentA1,
            school_id: schoolA,
            admission_number: `AUTHZ-A1-${nonce}`,
            first_name: "Synthetic",
            last_name: "Assigned",
            admission_date: "2026-02-02",
          },
          {
            id: studentA2,
            school_id: schoolA,
            admission_number: `AUTHZ-A2-${nonce}`,
            first_name: "Synthetic",
            last_name: "Other",
            admission_date: "2026-02-02",
          },
          {
            id: studentB1,
            school_id: schoolB,
            admission_number: `AUTHZ-B1-${nonce}`,
            first_name: "Synthetic",
            last_name: "School B",
            admission_date: "2026-02-02",
          },
        ])
      ).error,
    );
    expectSuccess(
      (
        await admin.from("enrollments").insert([
          {
            id: enrollmentA1,
            student_id: studentA1,
            academic_year_id: yearA,
            class_section_id: classA1,
            status: "ACTIVE",
            enrolled_on: "2026-02-02",
          },
          {
            id: enrollmentA2,
            student_id: studentA2,
            academic_year_id: yearA,
            class_section_id: classA2,
            status: "ACTIVE",
            enrolled_on: "2026-02-02",
          },
          {
            id: enrollmentAWithdrawn,
            student_id: studentA1,
            academic_year_id: yearA,
            class_section_id: classA1,
            status: "WITHDRAWN",
            enrolled_on: "2025-02-02",
            exited_on: "2025-06-01",
          },
          {
            id: enrollmentATransferred,
            student_id: studentA1,
            academic_year_id: yearA,
            class_section_id: classA1,
            status: "TRANSFERRED",
            enrolled_on: "2025-02-02",
            exited_on: "2025-06-01",
          },
          {
            id: enrollmentACompleted,
            student_id: studentA1,
            academic_year_id: yearA,
            class_section_id: classA1,
            status: "COMPLETED",
            enrolled_on: "2025-02-02",
            exited_on: "2025-12-01",
          },
          {
            id: enrollmentB1,
            student_id: studentB1,
            academic_year_id: yearB,
            class_section_id: classB1,
            status: "ACTIVE",
            enrolled_on: "2026-02-02",
          },
        ])
      ).error,
    );

    const subjectMembership = identities.get("subject")!.membershipId;
    const adminMembership = identities.get("school-admin")!.membershipId;
    expectSuccess(
      (
        await admin.from("teaching_assignments").insert([
          {
            id: teachingA1,
            term_id: termA,
            class_section_id: classA1,
            subject_id: subjectA1,
            staff_membership_id: subjectMembership,
            starts_on: "2026-05-25",
          },
          {
            id: teachingA2,
            term_id: termA,
            class_section_id: classA1,
            subject_id: subjectA2,
            staff_membership_id: adminMembership,
            starts_on: "2026-05-25",
          },
          {
            id: teachingA3,
            term_id: termA,
            class_section_id: classA2,
            subject_id: subjectA1,
            staff_membership_id: adminMembership,
            starts_on: "2026-05-25",
          },
          {
            id: teachingB1,
            term_id: termB,
            class_section_id: classB1,
            subject_id: subjectB1,
            staff_membership_id: identities.get("multi-school-b")!.membershipId,
            starts_on: "2026-05-25",
          },
        ])
      ).error,
    );
    expectSuccess(
      (
        await admin.from("class_teacher_assignments").insert({
          id: classTeacherA1,
          term_id: termA,
          class_section_id: classA1,
          staff_membership_id: identities.get("class")!.membershipId,
          starts_on: "2026-05-25",
        })
      ).error,
    );

    expectSuccess(
      (
        await admin.from("assessment_schemes").insert([
          {
            id: schemeA1,
            term_id: termA,
            grade_level_id: gradeA,
            subject_id: subjectA1,
            name: "Synthetic English",
            effective_from: "2026-05-25",
          },
          {
            id: schemeA2,
            term_id: termA,
            grade_level_id: gradeA,
            subject_id: subjectA2,
            name: "Synthetic Mathematics",
            effective_from: "2026-05-25",
          },
          {
            id: schemeB1,
            term_id: termB,
            grade_level_id: gradeB,
            subject_id: subjectB1,
            name: "Synthetic School B English",
            effective_from: "2026-05-25",
          },
        ])
      ).error,
    );
    expectSuccess(
      (
        await admin.from("assessment_components").insert([
          {
            id: componentA1,
            assessment_scheme_id: schemeA1,
            name: "Assessment",
            component_code: "ONE",
            maximum_score: 100,
            weight_percentage: 100,
            sort_order: 1,
          },
          {
            id: componentA2,
            assessment_scheme_id: schemeA2,
            name: "Assessment",
            component_code: "ONE",
            maximum_score: 100,
            weight_percentage: 100,
            sort_order: 1,
          },
          {
            id: componentB1,
            assessment_scheme_id: schemeB1,
            name: "Assessment",
            component_code: "ONE",
            maximum_score: 100,
            weight_percentage: 100,
            sort_order: 1,
          },
        ])
      ).error,
    );
    expectSuccess(
      (
        await admin
          .from("assessment_schemes")
          .update({ status: "ACTIVE" })
          .in("id", [schemeA1, schemeA2, schemeB1])
      ).error,
    );
    expectSuccess(
      (
        await admin.from("mark_sheets").insert([
          {
            id: sheetA1,
            term_id: termA,
            class_section_id: classA1,
            subject_id: subjectA1,
            assessment_scheme_id: schemeA1,
            teaching_assignment_id: teachingA1,
          },
          {
            id: sheetA2,
            term_id: termA,
            class_section_id: classA1,
            subject_id: subjectA2,
            assessment_scheme_id: schemeA2,
            teaching_assignment_id: teachingA2,
          },
          {
            id: sheetA3,
            term_id: termA,
            class_section_id: classA2,
            subject_id: subjectA1,
            assessment_scheme_id: schemeA1,
            teaching_assignment_id: teachingA3,
          },
          {
            id: sheetB1,
            term_id: termB,
            class_section_id: classB1,
            subject_id: subjectB1,
            assessment_scheme_id: schemeB1,
            teaching_assignment_id: teachingB1,
          },
        ])
      ).error,
    );
    expectSuccess(
      (
        await admin.from("marks").insert([
          {
            mark_sheet_id: sheetA1,
            assessment_component_id: componentA1,
            enrollment_id: enrollmentA1,
            score: 80,
          },
          {
            mark_sheet_id: sheetA2,
            assessment_component_id: componentA2,
            enrollment_id: enrollmentA1,
            score: 75,
          },
          {
            mark_sheet_id: sheetA3,
            assessment_component_id: componentA1,
            enrollment_id: enrollmentA2,
            score: 70,
          },
          {
            mark_sheet_id: sheetB1,
            assessment_component_id: componentB1,
            enrollment_id: enrollmentB1,
            score: 82,
          },
        ])
      ).error,
    );
  });

  afterAll(async () => {
    await admin
      .from("marks")
      .delete()
      .in("mark_sheet_id", [sheetA1, sheetA2, sheetA3, sheetB1]);
    await admin
      .from("mark_sheets")
      .delete()
      .in("id", [sheetA1, sheetA2, sheetA3, sheetB1]);
    await admin
      .from("assessment_components")
      .delete()
      .in("id", [componentA1, componentA2, componentB1]);
    await admin
      .from("assessment_schemes")
      .delete()
      .in("id", [schemeA1, schemeA2, schemeB1]);
    await admin
      .from("class_teacher_assignments")
      .delete()
      .eq("id", classTeacherA1);
    await admin
      .from("teaching_assignments")
      .delete()
      .in("id", [teachingA1, teachingA2, teachingA3, teachingB1]);
    await admin
      .from("enrollments")
      .delete()
      .in("id", [
        enrollmentA1,
        enrollmentA2,
        enrollmentAWithdrawn,
        enrollmentATransferred,
        enrollmentACompleted,
        enrollmentB1,
      ]);
    await admin
      .from("students")
      .delete()
      .in("id", [studentA1, studentA2, studentB1]);
    await admin
      .from("subjects")
      .delete()
      .in("id", [subjectA1, subjectA2, subjectB1]);
    await admin
      .from("class_sections")
      .delete()
      .in("id", [classA1, classA2, classB1]);
    await admin.from("grade_levels").delete().in("id", [gradeA, gradeB]);
    await admin.from("terms").delete().in("id", [termA, termB]);
    await admin.from("academic_years").delete().in("id", [yearA, yearB]);
    await admin
      .from("staff_role_assignments")
      .delete()
      .in(
        "membership_id",
        [...identities.values()].map(({ membershipId }) => membershipId),
      );
    await admin
      .from("school_staff_memberships")
      .delete()
      .in("profile_id", userIds);
    await admin.from("profiles").delete().in("id", userIds);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    await admin.from("schools").delete().in("id", [schoolA, schoolB]);
    await localDatabase.query(
      `revoke select, insert, update, delete on table ${fixtureTables
        .map((table) => `public.${table}`)
        .join(", ")} from service_role`,
    );
    await localDatabase.query(
      "revoke insert, update, delete on table public.schools from service_role",
    );
    await localDatabase.query(
      "revoke execute on function internal.assessment_scheme_weight_total(uuid) from service_role",
    );
    await localDatabase.end();
  });

  it.each([
    ["super", 35],
    ["school-admin", 35],
    ["head", 21],
    ["registrar", 17],
    ["class", 8],
    ["subject", 7],
  ] as const)(
    "%s receives the documented effective permissions",
    async (key, count) => {
      const client = await signedInClient(key);
      await selectMembership(client, identities.get(key)!.membershipId);
      const result = await permissions(
        client,
        identities.get(key)!.membershipId,
      );
      expect(result.size).toBe(count);
    },
  );

  it("does not disclose another user permissions", async () => {
    const client = await signedInClient("subject");
    await selectMembership(client, identities.get("subject")!.membershipId);
    expect(
      (await permissions(client, identities.get("school-admin")!.membershipId))
        .size,
    ).toBe(0);
  });

  it("binds multi-school RLS to one independently selected session membership", async () => {
    const sessionA = await signedInClient("multi");
    const sessionB = await signedInClient("multi");
    const membershipA = identities.get("multi")!.membershipId;
    const membershipB = identities.get("multi-school-b")!.membershipId;

    expect((await sessionA.from("students").select("id")).data).toEqual([]);
    expect((await permissions(sessionA, membershipA)).size).toBe(0);
    expect((await permissions(sessionA, membershipB)).size).toBe(0);

    await selectMembership(sessionA, membershipB);
    const schoolBPermissions = await permissions(sessionA, membershipB);
    expect(schoolBPermissions.has("SCHOOL_SETTINGS_MANAGE")).toBe(false);
    expect(schoolBPermissions.has("MARKS_ENTER")).toBe(true);
    expect((await permissions(sessionA, membershipA)).size).toBe(0);

    const [schoolBStudents, schoolBSheets, schoolBMarks, schoolAYears] =
      await Promise.all([
        sessionA.from("students").select("id"),
        sessionA.from("mark_sheets").select("id"),
        sessionA.from("marks").select("id"),
        sessionA.from("academic_years").select("id").eq("id", yearA),
      ]);
    expect(schoolBStudents.data?.map(({ id }) => id)).toEqual([studentB1]);
    expect(schoolBSheets.data?.map(({ id }) => id)).toEqual([sheetB1]);
    expect(schoolBMarks.data).toHaveLength(1);
    expect(schoolAYears.data).toEqual([]);

    await selectMembership(sessionB, membershipB);
    await selectMembership(sessionA, membershipA);
    const schoolAPermissions = await permissions(sessionA, membershipA);
    expect(schoolAPermissions.has("SCHOOL_SETTINGS_MANAGE")).toBe(true);
    expect((await permissions(sessionA, membershipB)).size).toBe(0);
    expect(
      (await sessionA.from("students").select("id").order("id")).data?.map(
        ({ id }) => id,
      ),
    ).toEqual([studentA1, studentA2].sort());
    expect(
      (await sessionA.from("students").select("id").eq("id", studentB1)).data,
    ).toEqual([]);

    expect((await sessionB.rpc("get_my_active_membership")).data).toBe(
      membershipB,
    );
    expect((await permissions(sessionB, membershipB)).has("MARKS_ENTER")).toBe(
      true,
    );
  });

  it("stops revoked roles on the next authoritative request", async () => {
    const client = await signedInClient("revoked");
    await selectMembership(client, identities.get("revoked")!.membershipId);
    expect(
      (await permissions(client, identities.get("revoked")!.membershipId)).size,
    ).toBe(0);
  });

  it("limits a subject teacher to assigned students and subject marks", async () => {
    const client = await signedInClient("subject");
    await selectMembership(client, identities.get("subject")!.membershipId);
    const [students, enrollments, sheets, marks] = await Promise.all([
      client.from("students").select("id"),
      client.from("enrollments").select("id, status"),
      client.from("mark_sheets").select("id"),
      client.from("marks").select("id"),
    ]);
    expect(students.data?.map(({ id }) => id)).toEqual([studentA1]);
    expect(enrollments.data).toEqual([{ id: enrollmentA1, status: "ACTIVE" }]);
    expect(sheets.data?.map(({ id }) => id)).toEqual([sheetA1]);
    expect(marks.data).toHaveLength(1);
  });

  it("lets a class teacher read the assigned class across subjects", async () => {
    const client = await signedInClient("class");
    await selectMembership(client, identities.get("class")!.membershipId);
    const [students, sheets] = await Promise.all([
      client.from("students").select("id"),
      client.from("mark_sheets").select("id").order("id"),
    ]);
    expect(students.data?.map(({ id }) => id)).toEqual([studentA1]);
    expect(new Set(sheets.data?.map(({ id }) => id))).toEqual(
      new Set([sheetA1, sheetA2]),
    );
  });

  it("denies roster and mark access to an unassigned teacher", async () => {
    const client = await signedInClient("unassigned");
    await selectMembership(client, identities.get("unassigned")!.membershipId);
    expect((await client.from("students").select("id")).data).toEqual([]);
    expect((await client.from("marks").select("id")).data).toEqual([]);
  });

  it("keeps guardian and parent records denied", async () => {
    const client = await signedInClient("school-admin");
    await selectMembership(
      client,
      identities.get("school-admin")!.membershipId,
    );
    expect((await client.from("guardians").select("id")).error?.code).toBe(
      "42501",
    );
    expect(
      (await client.from("student_access_credentials").select("id")).error
        ?.code,
    ).toBe("42501");
    expect(
      (await client.from("parent_access_sessions").select("id")).error?.code,
    ).toBe("42501");
  });

  it("keeps browser writes denied despite future mutation permissions", async () => {
    const client = await signedInClient("school-admin");
    await selectMembership(
      client,
      identities.get("school-admin")!.membershipId,
    );
    const write = await client
      .from("students")
      .update({ first_name: "Denied" })
      .eq("id", studentA1);
    expect(write.error?.code).toBe("42501");
  });

  it("uses generated permission values in test expectations", () => {
    const expected: AppPermission = "DASHBOARD_VIEW";
    expect(expected).toBe("DASHBOARD_VIEW");
  });
});
