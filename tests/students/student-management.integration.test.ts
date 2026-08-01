import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/types/database.generated";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL!;
const password = "synthetic-student-stage-seven-password";
const nonce = Date.now();
const schoolId = randomUUID();
const otherSchoolId = randomUUID();
const yearId = randomUUID();
const laterYearId = randomUUID();
const otherYearId = randomUUID();
const gradeId = randomUUID();
const otherGradeId = randomUUID();
const classId = randomUUID();
const laterClassId = randomUUID();
const unassignedClassId = randomUUID();
const fullClassId = randomUUID();
const otherClassId = randomUUID();
const termId = randomUUID();
const subjectId = randomUUID();
const database = new Client({ connectionString: databaseUrl });
const adminApi = createClient<Database>(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});

type Role = Database["public"]["Enums"]["staff_role"];
type ClientType = SupabaseClient<Database>;
const identities = new Map<
  string,
  { email: string; userId: string; membershipId: string }
>();
let registrar: ClientType;
let schoolAdmin: ClientType;
let admittedStudentId: string;
let admittedUpdatedAt: string;
let enrollmentId: string;
let enrollmentUpdatedAt: string;
let assignedStudentId: string;
let firstRelationshipId: string;

async function createIdentity(
  key: string,
  role: Role,
  targetSchoolId = schoolId,
  revoked = false,
) {
  const email = `students.${key}.${nonce}@example.invalid`;
  const auth = await adminApi.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  const userId = auth.data.user.id;
  const membershipId = randomUUID();
  await database.query(
    `insert into public.profiles (id, first_name, last_name) values ($1, 'Synthetic', 'Student Staff')`,
    [userId],
  );
  await database.query(
    `insert into public.school_staff_memberships (id, school_id, profile_id, employee_number, status) values ($1,$2,$3,$4,'ACTIVE')`,
    [membershipId, targetSchoolId, userId, `STU-${key}-${nonce}`],
  );
  await database.query(
    `insert into public.staff_role_assignments (membership_id, role, granted_at, revoked_at) values ($1,$2,case when $3 then now() - interval '1 day' else now() end,case when $3 then now() else null end)`,
    [membershipId, role, revoked],
  );
  identities.set(key, { email, userId, membershipId });
}

async function signedIn(key: string) {
  const identity = identities.get(key)!;
  const client = createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const login = await client.auth.signInWithPassword({
    email: identity.email,
    password,
  });
  if (login.error) throw login.error;
  const selected = await client.rpc("set_my_active_membership", {
    target_membership_id: identity.membershipId,
  });
  if (selected.error) throw selected.error;
  return client;
}

async function createFixtureStudent(label: string) {
  const id = randomUUID();
  const result = await database.query<{ id: string; updated_at: string }>(
    `insert into public.students (id,school_id,admission_number,first_name,last_name,admission_date)
     values ($1,$2,$3,$4,'Learner','2026-02-01') returning id,updated_at::text`,
    [id, schoolId, `${label}-${nonce}-${id.slice(0, 6)}`, label],
  );
  return result.rows[0]!;
}

async function createFixtureClass(
  label: string,
  capacity: number | null,
  targetYearId = yearId,
) {
  const id = randomUUID();
  await database.query(
    `insert into public.class_sections
      (id,academic_year_id,grade_level_id,name,class_code,capacity)
     values ($1,$2,$3,$4,$5,$6)`,
    [id, targetYearId, gradeId, label, `${label}-${id.slice(0, 4)}`, capacity],
  );
  return id;
}

describe.sequential("local student-management security and workflows", () => {
  beforeAll(async () => {
    await database.connect();
    await database.query(
      `insert into public.schools (id,name,slug,school_code) values ($1,'Synthetic Student School',$2,$3),($4,'Synthetic Other Student School',$5,$6)`,
      [
        schoolId,
        `student-school-${nonce}`,
        `STU-${nonce}`,
        otherSchoolId,
        `student-other-${nonce}`,
        `STU-O-${nonce}`,
      ],
    );
    await database.query(
      `insert into public.academic_years (id,school_id,name,starts_on,ends_on,status)
       values ($1,$2,'2026 Synthetic','2026-01-01','2026-12-31','ACTIVE'),
              ($3,$2,'2027 Synthetic','2027-01-01','2027-12-31','DRAFT'),
              ($4,$5,'2026 Other','2026-01-01','2026-12-31','ACTIVE')`,
      [yearId, schoolId, laterYearId, otherYearId, otherSchoolId],
    );
    await database.query(
      `insert into public.grade_levels (id,school_id,code,name,sort_order) values ($1,$2,'P1','Primary One',1),($3,$4,'P1','Other Primary One',1)`,
      [gradeId, schoolId, otherGradeId, otherSchoolId],
    );
    await database.query(
      `insert into public.class_sections (id,academic_year_id,grade_level_id,name,class_code,capacity)
       values ($1,$2,$3,'P1 North','P1-N',10),
              ($4,$2,$3,'P1 Full','P1-F',1),
              ($5,$6,$3,'P1 Later','P1-L',10),
              ($7,$2,$3,'P1 Unassigned','P1-U',10),
              ($8,$9,$10,'Other P1','OP1',10)`,
      [
        classId,
        yearId,
        gradeId,
        fullClassId,
        laterClassId,
        laterYearId,
        unassignedClassId,
        otherClassId,
        otherYearId,
        otherGradeId,
      ],
    );
    await database.query(
      `insert into public.terms (id,academic_year_id,name,term_number,starts_on,ends_on,status) values ($1,$2,'Full Year',1,'2026-01-01','2026-12-31','OPEN')`,
      [termId, yearId],
    );
    await database.query(
      `insert into public.subjects (id,school_id,code,name,sort_order) values ($1,$2,'ENG','English',1)`,
      [subjectId, schoolId],
    );
    for (const [key, role] of [
      ["admin", "SCHOOL_ADMIN"],
      ["registrar", "ACADEMIC_REGISTRAR"],
      ["head", "HEAD_TEACHER"],
      ["class", "CLASS_TEACHER"],
      ["subject", "SUBJECT_TEACHER"],
    ] as const)
      await createIdentity(key, role);
    await createIdentity("revoked", "ACADEMIC_REGISTRAR", schoolId, true);
    await createIdentity("mixed", "HEAD_TEACHER");
    const mixed = identities.get("mixed")!;
    const otherMembershipId = randomUUID();
    await database.query(
      `insert into public.school_staff_memberships (id,school_id,profile_id,employee_number,status) values ($1,$2,$3,$4,'ACTIVE')`,
      [otherMembershipId, otherSchoolId, mixed.userId, `STU-MIX-O-${nonce}`],
    );
    await database.query(
      `insert into public.staff_role_assignments (membership_id,role) values ($1,'ACADEMIC_REGISTRAR')`,
      [otherMembershipId],
    );
    await database.query(
      `insert into public.class_teacher_assignments (term_id,class_section_id,staff_membership_id,starts_on,is_active) values ($1,$2,$3,'2026-01-01',true)`,
      [termId, classId, identities.get("class")!.membershipId],
    );
    await database.query(
      `insert into public.teaching_assignments (term_id,class_section_id,subject_id,staff_membership_id,starts_on,is_active) values ($1,$2,$3,$4,'2026-01-01',true)`,
      [termId, classId, subjectId, identities.get("subject")!.membershipId],
    );
    const assigned = await database.query<{ id: string }>(
      `insert into public.students (school_id,admission_number,first_name,last_name,admission_date) values ($1,$2,'Assigned','Learner','2026-02-01') returning id`,
      [schoolId, `ASSIGNED-${nonce}`],
    );
    assignedStudentId = assigned.rows[0]!.id;
    await database.query(
      `insert into public.enrollments (student_id,academic_year_id,class_section_id,class_number,status,enrolled_on) values ($1,$2,$3,'10','ACTIVE','2026-02-01')`,
      [assignedStudentId, yearId, classId],
    );
    const full = await database.query<{ id: string }>(
      `insert into public.students (school_id,admission_number,first_name,last_name,admission_date) values ($1,$2,'Capacity','Learner','2026-02-01') returning id`,
      [schoolId, `FULL-${nonce}`],
    );
    await database.query(
      `insert into public.enrollments (student_id,academic_year_id,class_section_id,class_number,status,enrolled_on) values ($1,$2,$3,'1','ACTIVE','2026-02-01')`,
      [full.rows[0]!.id, yearId, fullClassId],
    );
    registrar = await signedIn("registrar");
    schoolAdmin = await signedIn("admin");
  });

  afterAll(async () => {
    await database.end();
  });

  it.each([
    ["admin", true, true],
    ["registrar", true, true],
    ["head", true, false],
    ["class", true, false],
    ["subject", true, false],
    ["revoked", false, false],
  ] as const)(
    "%s receives the expected student permissions",
    async (key, view, manage) => {
      const client = await signedIn(key);
      const permissions = await client.rpc("get_my_effective_permissions", {
        target_membership_id: identities.get(key)!.membershipId,
      });
      expect(permissions.error).toBeNull();
      expect(
        Boolean(
          permissions.data?.some(
            (permission) =>
              permission === "STUDENTS_VIEW_ALL" ||
              permission === "STUDENTS_VIEW_ASSIGNED",
          ),
        ),
      ).toBe(view);
      expect(permissions.data?.includes("STUDENTS_MANAGE") ?? false).toBe(
        manage,
      );
    },
  );

  it("admits a student with an initial enrolment atomically", async () => {
    const result = await registrar.rpc("admit_student", {
      admission_number: ` stg-${nonce} `,
      first_name: "Ada",
      middle_name: "",
      last_name: "Lovelace",
      gender: "",
      date_of_birth: "2018-01-01",
      admission_date: "2026-02-01",
      initial_academic_year_id: yearId,
      initial_class_section_id: classId,
      class_number: "21",
      enrollment_status: "ACTIVE",
      capacity_override: false,
      capacity_override_reason: "",
      first_guardian: null,
    });
    expect(result.error).toBeNull();
    admittedStudentId = result.data![0]!.student_id;
    admittedUpdatedAt = result.data![0]!.updated_at;
    enrollmentId = result.data![0]!.enrollment_id;
    const history = await registrar.rpc("get_student_enrollment_history", {
      target_student_id: admittedStudentId,
    });
    expect(history.data).toHaveLength(1);
    enrollmentUpdatedAt = history.data![0]!.updated_at;
  });

  it("rejects a normalized duplicate admission number", async () => {
    const result = await registrar.rpc("admit_student", {
      admission_number: `STG-${nonce}`,
      first_name: "Duplicate",
      middle_name: "",
      last_name: "Learner",
      gender: "",
      date_of_birth: "2018-01-01",
      admission_date: "2026-02-01",
    });
    expect(result.error?.code).toBe("23505");
  });

  it("updates profiles and rejects stale concurrency tokens without false audit", async () => {
    const before = await database.query<{ count: string }>(
      `select count(*) from public.audit_logs where entity_id=$1 and action='STUDENT_PROFILE_UPDATED'`,
      [admittedStudentId],
    );
    const updated = await registrar.rpc("update_student_profile", {
      target_student_id: admittedStudentId,
      expected_updated_at: admittedUpdatedAt,
      admission_number: `STG-${nonce}`,
      first_name: "Augusta Ada",
      middle_name: "",
      last_name: "Lovelace",
      gender: "Female",
      date_of_birth: "2018-01-01",
      admission_date: "2026-02-01",
    });
    expect(updated.error).toBeNull();
    admittedUpdatedAt = updated.data![0]!.updated_at;
    const stale = await registrar.rpc("update_student_profile", {
      target_student_id: admittedStudentId,
      expected_updated_at: "2020-01-01T00:00:00Z",
      admission_number: `STG-${nonce}`,
      first_name: "Stale",
      middle_name: "",
      last_name: "Edit",
      gender: "",
      date_of_birth: "2018-01-01",
      admission_date: "2026-02-01",
    });
    expect(stale.error?.code).toBe("PT409");
    const after = await database.query<{ count: string }>(
      `select count(*) from public.audit_logs where entity_id=$1 and action='STUDENT_PROFILE_UPDATED'`,
      [admittedStudentId],
    );
    expect(Number(after.rows[0]!.count) - Number(before.rows[0]!.count)).toBe(
      1,
    );
  });

  it("supports server-side search and filters", async () => {
    const result = await registrar.rpc("list_students", {
      search_text: "Augusta",
      filter_student_status: "ACTIVE",
      filter_academic_year_id: yearId,
      filter_class_section_id: classId,
      page_number: 1,
      page_size: 10,
    });
    expect(result.error).toBeNull();
    expect(result.data?.map((row) => row.student_id)).toContain(
      admittedStudentId,
    );
  });

  it("view-only staff cannot mutate", async () => {
    const head = await signedIn("head");
    const result = await head.rpc("change_student_status", {
      target_student_id: admittedStudentId,
      expected_updated_at: admittedUpdatedAt,
      target_status: "INACTIVE",
      effective_date: "2026-07-01",
      reason: "Synthetic denial",
    });
    expect(result.error?.code).toBe("42501");
  });

  it("enforces class capacity and restricts overrides to school administrators", async () => {
    const denied = await registrar.rpc("move_student_class", {
      target_enrollment_id: enrollmentId,
      expected_updated_at: enrollmentUpdatedAt,
      target_class_section_id: fullClassId,
      class_number: "2",
      capacity_override: true,
      capacity_override_reason: "Synthetic capacity approval",
    });
    expect(denied.error?.code).toBe("42501");
    const moved = await schoolAdmin.rpc("move_student_class", {
      target_enrollment_id: enrollmentId,
      expected_updated_at: enrollmentUpdatedAt,
      target_class_section_id: fullClassId,
      class_number: "2",
      capacity_override: true,
      capacity_override_reason: "Synthetic administrator override",
    });
    expect(moved.error).toBeNull();
    enrollmentUpdatedAt = moved.data![0]!.updated_at;
  });

  it("serializes two simultaneous final-seat enrolments", async () => {
    const destinationId = await createFixtureClass("Final Seat", 1);
    const studentA = await createFixtureStudent("ConcurrentA");
    const studentB = await createFixtureStudent("ConcurrentB");
    const [sessionA, sessionB] = await Promise.all([
      signedIn("registrar"),
      signedIn("registrar"),
    ]);

    const [requestA, requestB] = await Promise.all([
      sessionA.rpc("create_student_enrollment", {
        target_student_id: studentA.id,
        target_academic_year_id: yearId,
        target_class_section_id: destinationId,
        class_number: "1",
        enrollment_status: "ACTIVE",
        enrolled_on: "2026-03-01",
        capacity_override: false,
        capacity_override_reason: "",
      }),
      sessionB.rpc("create_student_enrollment", {
        target_student_id: studentB.id,
        target_academic_year_id: yearId,
        target_class_section_id: destinationId,
        class_number: "2",
        enrollment_status: "ACTIVE",
        enrolled_on: "2026-03-01",
        capacity_override: false,
        capacity_override_reason: "",
      }),
    ]);

    const results = [requestA, requestB];
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    expect(
      results.filter((result) =>
        result.error?.message.includes("CLASS_CAPACITY_REACHED"),
      ),
    ).toHaveLength(1);
    const final = await database.query<{ count: string }>(
      `select count(*) from public.enrollments
       where class_section_id=$1 and status in ('ACTIVE','REPEATING')`,
      [destinationId],
    );
    expect(final.rows[0]!.count).toBe("1");
    const failedStudentId = requestA.error ? studentA.id : studentB.id;
    const failed = await database.query<{
      enrollments: string;
      audits: string;
    }>(
      `select
        (select count(*) from public.enrollments where student_id=$1)::text enrollments,
        (select count(*) from public.audit_logs
          where action='ENROLLMENT_CREATED' and new_values->>'student_id'=$1::text)::text audits`,
      [failedStudentId],
    );
    expect(failed.rows[0]).toEqual({ enrollments: "0", audits: "0" });
  });

  it("serializes concurrent class moves to the final place", async () => {
    const sourceId = await createFixtureClass("Move Source", null);
    const destinationId = await createFixtureClass("Move Final", 1);
    const studentA = await createFixtureStudent("MoveA");
    const studentB = await createFixtureStudent("MoveB");
    const inserted = await database.query<{ id: string; updated_at: string }>(
      `insert into public.enrollments
        (student_id,academic_year_id,class_section_id,status,enrolled_on)
       values ($1,$3,$4,'ACTIVE','2026-03-01'),($2,$3,$4,'ACTIVE','2026-03-01')
       returning id,updated_at::text`,
      [studentA.id, studentB.id, yearId, sourceId],
    );
    const [sessionA, sessionB] = await Promise.all([
      signedIn("registrar"),
      signedIn("registrar"),
    ]);
    const results = await Promise.all([
      sessionA.rpc("move_student_class", {
        target_enrollment_id: inserted.rows[0]!.id,
        expected_updated_at: inserted.rows[0]!.updated_at,
        target_class_section_id: destinationId,
        class_number: "1",
        capacity_override: false,
        capacity_override_reason: "",
      }),
      sessionB.rpc("move_student_class", {
        target_enrollment_id: inserted.rows[1]!.id,
        expected_updated_at: inserted.rows[1]!.updated_at,
        target_class_section_id: destinationId,
        class_number: "2",
        capacity_override: false,
        capacity_override_reason: "",
      }),
    ]);
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    expect(
      results.filter((result) =>
        result.error?.message.includes("CLASS_CAPACITY_REACHED"),
      ),
    ).toHaveLength(1);
    const final = await database.query<{ count: string }>(
      `select count(*) from public.enrollments
       where class_section_id=$1 and status in ('ACTIVE','REPEATING')`,
      [destinationId],
    );
    expect(final.rows[0]!.count).toBe("1");
  });

  it("releases the serialized class lock after rollback", async () => {
    const destinationId = await createFixtureClass("Rollback Seat", 1);
    const student = await createFixtureStudent("Rollback");
    const session = await signedIn("registrar");
    const blocker = new Client({ connectionString: databaseUrl });
    await blocker.connect();
    await blocker.query("begin");
    await blocker.query(
      "select id from public.class_sections where id=$1 for update",
      [destinationId],
    );
    let settled = false;
    const pending = session
      .rpc("create_student_enrollment", {
        target_student_id: student.id,
        target_academic_year_id: yearId,
        target_class_section_id: destinationId,
        class_number: "1",
        enrollment_status: "ACTIVE",
        enrolled_on: "2026-03-01",
        capacity_override: false,
        capacity_override_reason: "",
      })
      .then((result) => {
        settled = true;
        return result;
      });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(settled).toBe(false);
    await blocker.query("rollback");
    const result = await pending;
    await blocker.end();
    expect(result.error).toBeNull();
  });

  it("creates guardians and replaces the primary relationship atomically", async () => {
    const first = await registrar.rpc("create_and_link_guardian", {
      target_student_id: admittedStudentId,
      first_name: "Mary",
      middle_name: "",
      last_name: "Jackson",
      phone: "+14155550101",
      email: `mary.${nonce}@example.invalid`,
      relationship: "Mother",
      primary_guardian: true,
      report_access_eligible: false,
    });
    expect(first.error).toBeNull();
    firstRelationshipId = first.data![0]!.relationship_id;
    const second = await registrar.rpc("create_and_link_guardian", {
      target_student_id: admittedStudentId,
      first_name: "Dorothy",
      middle_name: "",
      last_name: "Vaughan",
      phone: "+14155550102",
      email: `dorothy.${nonce}@example.invalid`,
      relationship: "Aunt",
      primary_guardian: true,
      report_access_eligible: true,
    });
    expect(second.error).toBeNull();
    const guardians = await registrar.rpc("get_student_guardians", {
      target_student_id: admittedStudentId,
    });
    expect(
      guardians.data?.filter((guardian) => guardian.is_primary),
    ).toHaveLength(1);
    expect(
      guardians.data?.find(
        (guardian) => guardian.relationship_id === firstRelationshipId,
      )?.is_primary,
    ).toBe(false);
    const demotion = await database.query<{ count: string }>(
      `select count(*) from public.audit_logs
       where action='STUDENT_GUARDIAN_PRIMARY_REMOVED' and entity_id=$1`,
      [firstRelationshipId],
    );
    expect(demotion.rows[0]!.count).toBe("1");
  });

  it("serializes concurrent primary-guardian replacements and audits demotions", async () => {
    const student = await createFixtureStudent("GuardianRace");
    for (const [firstName, primary] of [
      ["Initial", true],
      ["CandidateOne", false],
      ["CandidateTwo", false],
    ] as const) {
      const result = await registrar.rpc("create_and_link_guardian", {
        target_student_id: student.id,
        first_name: firstName,
        middle_name: "",
        last_name: "Guardian",
        phone: "",
        email: `${firstName.toLowerCase()}.${nonce}@example.invalid`,
        relationship: "Guardian",
        primary_guardian: primary,
        report_access_eligible: false,
      });
      expect(result.error).toBeNull();
    }
    const before = await registrar.rpc("get_student_guardians", {
      target_student_id: student.id,
    });
    const candidates = before.data!.filter((guardian) => !guardian.is_primary);
    const [sessionA, sessionB] = await Promise.all([
      signedIn("registrar"),
      signedIn("registrar"),
    ]);
    const results = await Promise.all([
      sessionA.rpc("update_student_guardian_relationship", {
        target_relationship_id: candidates[0]!.relationship_id,
        expected_updated_at: candidates[0]!.relationship_updated_at,
        relationship: candidates[0]!.relationship,
        primary_guardian: true,
        report_access_eligible: false,
      }),
      sessionB.rpc("update_student_guardian_relationship", {
        target_relationship_id: candidates[1]!.relationship_id,
        expected_updated_at: candidates[1]!.relationship_updated_at,
        relationship: candidates[1]!.relationship,
        primary_guardian: true,
        report_access_eligible: false,
      }),
    ]);
    expect(results.every((result) => !result.error)).toBe(true);
    const final = await registrar.rpc("get_student_guardians", {
      target_student_id: student.id,
    });
    expect(final.data?.filter((guardian) => guardian.is_primary)).toHaveLength(
      1,
    );
    const audits = await database.query<{ count: string }>(
      `select count(*) from public.audit_logs audit
       join public.student_guardians link on link.id=audit.entity_id
       where link.student_id=$1 and audit.action='STUDENT_GUARDIAN_PRIMARY_REMOVED'`,
      [student.id],
    );
    expect(Number(audits.rows[0]!.count)).toBeGreaterThanOrEqual(2);
  });

  it("assigned teachers see only assigned students and no guardian contacts", async () => {
    for (const key of ["class", "subject"] as const) {
      const client = await signedIn(key);
      const list = await client.rpc("list_students", {
        page_number: 1,
        page_size: 100,
      });
      expect(list.data?.map((student) => student.student_id)).toEqual([
        assignedStudentId,
      ]);
      const guardians = await client.rpc("get_student_guardians", {
        target_student_id: assignedStudentId,
      });
      expect(guardians.data).toEqual([]);
      const direct = await client.from("guardians").select("id,phone,email");
      expect(direct.error).not.toBeNull();
    }
  });

  it("schoolwide viewers receive intended guardian information", async () => {
    const head = await signedIn("head");
    const guardians = await head.rpc("get_student_guardians", {
      target_student_id: admittedStudentId,
    });
    expect(guardians.error).toBeNull();
    expect(guardians.data).toHaveLength(2);
  });

  it("photo policies allow scoped uploads and deny cross-school paths", async () => {
    const ownPath = `${schoolId}/${assignedStudentId}/${randomUUID()}.jpg`;
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);
    const own = await schoolAdmin.storage
      .from("student-photos")
      .upload(ownPath, bytes, { contentType: "image/jpeg" });
    expect(own.error).toBeNull();
    const detail = await schoolAdmin.rpc("get_student_details", {
      target_student_id: assignedStudentId,
    });
    const linked = await schoolAdmin.rpc("set_student_photo_path", {
      target_student_id: assignedStudentId,
      expected_updated_at: detail.data![0]!.updated_at,
      photo_storage_path: ownPath,
    });
    expect(linked.error).toBeNull();
    const auditBeforeFailures = await database.query<{ count: string }>(
      `select count(*) from public.audit_logs
       where entity_id=$1 and action='STUDENT_PHOTO_CHANGED'`,
      [assignedStudentId],
    );
    const missing = await schoolAdmin.rpc("set_student_photo_path", {
      target_student_id: assignedStudentId,
      expected_updated_at: linked.data![0]!.updated_at,
      photo_storage_path: `${schoolId}/${assignedStudentId}/${randomUUID()}.jpg`,
    });
    expect(missing.error?.message).toContain("STUDENT_PHOTO_OBJECT_NOT_FOUND");
    const otherStudent = await createFixtureStudent("PhotoOther");
    const otherPath = `${schoolId}/${otherStudent.id}/${randomUUID()}.jpg`;
    const otherUpload = await schoolAdmin.storage
      .from("student-photos")
      .upload(otherPath, bytes, { contentType: "image/jpeg" });
    expect(otherUpload.error).toBeNull();
    const crossStudent = await schoolAdmin.rpc("set_student_photo_path", {
      target_student_id: assignedStudentId,
      expected_updated_at: linked.data![0]!.updated_at,
      photo_storage_path: otherPath,
    });
    expect(crossStudent.error?.message).toContain("STUDENT_PHOTO_PATH_INVALID");
    const forged = await schoolAdmin.storage
      .from("student-photos")
      .upload(
        `${otherSchoolId}/${assignedStudentId}/${randomUUID()}.jpg`,
        bytes,
        { contentType: "image/jpeg" },
      );
    expect(forged.error).not.toBeNull();
    const crossSchool = await schoolAdmin.rpc("set_student_photo_path", {
      target_student_id: assignedStudentId,
      expected_updated_at: linked.data![0]!.updated_at,
      photo_storage_path: `${otherSchoolId}/${assignedStudentId}/${randomUUID()}.jpg`,
    });
    expect(crossSchool.error?.message).toContain("STUDENT_PHOTO_PATH_INVALID");
    const auditAfterFailures = await database.query<{ count: string }>(
      `select count(*) from public.audit_logs
       where entity_id=$1 and action='STUDENT_PHOTO_CHANGED'`,
      [assignedStudentId],
    );
    expect(auditAfterFailures.rows[0]!.count).toBe(
      auditBeforeFailures.rows[0]!.count,
    );
  });

  it("direct browser writes remain denied", async () => {
    const direct = await registrar.from("students").insert({
      school_id: schoolId,
      admission_number: `FORGED-${nonce}`,
      first_name: "Forged",
      last_name: "Browser",
      admission_date: "2026-02-01",
    });
    expect(direct.error).not.toBeNull();
  });

  it("completes an enrolment without completing the student and creates a genuine later-year enrolment", async () => {
    const student = await createFixtureStudent("LaterYear");
    const initial = await registrar.rpc("create_student_enrollment", {
      target_student_id: student.id,
      target_academic_year_id: yearId,
      target_class_section_id: classId,
      class_number: "31",
      enrollment_status: "ACTIVE",
      enrolled_on: "2026-02-01",
      capacity_override: false,
      capacity_override_reason: "",
    });
    expect(initial.error).toBeNull();
    const completed = await registrar.rpc("change_enrollment_status", {
      target_enrollment_id: initial.data![0]!.enrollment_id,
      expected_updated_at: initial.data![0]!.updated_at,
      target_status: "COMPLETED",
      exited_on: "2026-12-31",
      reason: "Academic year completed",
    });
    expect(completed.error).toBeNull();
    const afterCompletion = await database.query<{
      student_status: string;
      enrollment_status: string;
      student_audits: string;
    }>(
      `select student.status student_status,enrollment.status enrollment_status,
        (select count(*) from public.audit_logs
         where entity_id=student.id and action='STUDENT_STATUS_CHANGED')::text student_audits
       from public.students student
       join public.enrollments enrollment on enrollment.student_id=student.id
       where student.id=$1`,
      [student.id],
    );
    expect(afterCompletion.rows[0]).toEqual({
      student_status: "ACTIVE",
      enrollment_status: "COMPLETED",
      student_audits: "0",
    });

    const later = await registrar.rpc("create_student_enrollment", {
      target_student_id: student.id,
      target_academic_year_id: laterYearId,
      target_class_section_id: laterClassId,
      class_number: "7",
      enrollment_status: "ACTIVE",
      enrolled_on: "2027-01-15",
      capacity_override: false,
      capacity_override_reason: "",
    });
    expect(later.error).toBeNull();
    const history = await registrar.rpc("get_student_enrollment_history", {
      target_student_id: student.id,
    });
    expect(history.data?.map((row) => row.status)).toEqual([
      "ACTIVE",
      "COMPLETED",
    ]);
    expect(
      history.data?.filter((row) =>
        ["ACTIVE", "REPEATING"].includes(row.status),
      ),
    ).toHaveLength(1);

    const unfiltered = await registrar.rpc("list_students", {
      search_text: "LaterYear",
      page_number: 1,
      page_size: 10,
    });
    const current = unfiltered.data?.find(
      (row) => row.student_id === student.id,
    );
    expect(current?.academic_year_id).toBe(laterYearId);
    expect(current?.placement_is_current).toBe(true);
    for (const filter of [
      { filter_academic_year_id: yearId },
      { filter_class_section_id: classId },
      { filter_enrollment_status: "COMPLETED" as const },
    ]) {
      const result = await registrar.rpc("list_students", {
        ...filter,
        page_number: 1,
        page_size: 100,
      });
      const historical = result.data?.find(
        (row) => row.student_id === student.id,
      );
      expect(historical?.enrollment_status).toBe("COMPLETED");
      expect(historical?.placement_is_current).toBe(false);
    }

    await expect(
      database.query(
        `insert into public.enrollments
          (student_id,academic_year_id,class_section_id,status,enrolled_on)
         values ($1,$2,$3,'REPEATING','2026-03-01')`,
        [student.id, yearId, classId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("requires explicit inactive-student reactivation before enrolment", async () => {
    const student = await createFixtureStudent("Reactivate");
    const inactive = await registrar.rpc("change_student_status", {
      target_student_id: student.id,
      expected_updated_at: student.updated_at,
      target_status: "INACTIVE",
      effective_date: "2026-04-01",
      reason: "Temporary approved inactivity",
    });
    expect(inactive.error).toBeNull();
    const denied = await registrar.rpc("create_student_enrollment", {
      target_student_id: student.id,
      target_academic_year_id: yearId,
      target_class_section_id: classId,
      class_number: "41",
      enrollment_status: "ACTIVE",
      enrolled_on: "2026-04-02",
      capacity_override: false,
      capacity_override_reason: "",
    });
    expect(denied.error?.message).toContain("STUDENT_STATUS_NOT_ENROLLABLE");
    const reactivated = await registrar.rpc("change_student_status", {
      target_student_id: student.id,
      expected_updated_at: inactive.data![0]!.updated_at,
      target_status: "ACTIVE",
      effective_date: "2026-04-03",
      reason: "Approved return to active study",
    });
    expect(reactivated.error).toBeNull();
    const created = await registrar.rpc("create_student_enrollment", {
      target_student_id: student.id,
      target_academic_year_id: yearId,
      target_class_section_id: classId,
      class_number: "41",
      enrollment_status: "ACTIVE",
      enrolled_on: "2026-04-03",
      capacity_override: false,
      capacity_override_reason: "",
    });
    expect(created.error).toBeNull();
    const audits = await database.query<{ count: string }>(
      `select count(*) from public.audit_logs
       where entity_id=$1 and action='STUDENT_STATUS_CHANGED'`,
      [student.id],
    );
    expect(audits.rows[0]!.count).toBe("2");
  });

  it("filters withdrawn historical placements without exposing them to assigned-only teachers", async () => {
    const student = await createFixtureStudent("HistoricalPrivacy");
    const historical = await database.query<{ id: string }>(
      `insert into public.enrollments
        (student_id,academic_year_id,class_section_id,status,enrolled_on,exited_on)
       values ($1,$2,$3,'WITHDRAWN','2026-02-01','2026-05-01') returning id`,
      [student.id, yearId, classId],
    );
    await database.query(
      `insert into public.enrollments
        (student_id,academic_year_id,class_section_id,status,enrolled_on)
       values ($1,$2,$3,'ACTIVE','2026-05-02')`,
      [student.id, yearId, unassignedClassId],
    );
    const schoolwide = await registrar.rpc("list_students", {
      filter_enrollment_status: "WITHDRAWN",
      filter_class_section_id: classId,
      page_number: 1,
      page_size: 100,
    });
    expect(
      schoolwide.data?.find((row) => row.student_id === student.id),
    ).toMatchObject({
      enrollment_id: historical.rows[0]!.id,
      placement_is_current: false,
    });
    for (const key of ["class", "subject"] as const) {
      const assigned = await signedIn(key);
      const result = await assigned.rpc("list_students", {
        filter_class_section_id: classId,
        filter_enrollment_status: "WITHDRAWN",
        page_number: 1,
        page_size: 100,
      });
      expect(result.data?.some((row) => row.student_id === student.id)).toBe(
        false,
      );
    }
  });

  it("student terminal status closes the current enrolment consistently", async () => {
    const result = await registrar.rpc("change_student_status", {
      target_student_id: admittedStudentId,
      expected_updated_at: admittedUpdatedAt,
      target_status: "WITHDRAWN",
      effective_date: "2026-08-01",
      reason: "Synthetic family relocation",
    });
    expect(result.error).toBeNull();
    const row = await database.query<{
      student_status: string;
      enrollment_status: string;
      exited_on: string;
    }>(
      `select s.status student_status,e.status enrollment_status,e.exited_on::text from public.students s join public.enrollments e on e.student_id=s.id where s.id=$1`,
      [admittedStudentId],
    );
    expect(row.rows[0]).toMatchObject({
      student_status: "WITHDRAWN",
      enrollment_status: "WITHDRAWN",
      exited_on: "2026-08-01",
    });
  });

  it("multi-school permissions follow only the selected session membership", async () => {
    const mixedClient = await signedIn("mixed");
    const permissions = await mixedClient.rpc("get_my_effective_permissions", {
      target_membership_id: identities.get("mixed")!.membershipId,
    });
    expect(permissions.data).toContain("STUDENTS_VIEW_ALL");
    expect(permissions.data).not.toContain("STUDENTS_MANAGE");
    const mutation = await mixedClient.rpc("admit_student", {
      admission_number: `MIX-${nonce}`,
      first_name: "Mixed",
      middle_name: "",
      last_name: "Denied",
      gender: "",
      date_of_birth: "2018-01-01",
      admission_date: "2026-02-01",
    });
    expect(mutation.error?.code).toBe("42501");
  });

  it("revoked roles fail immediately", async () => {
    const revoked = await signedIn("revoked");
    const list = await revoked.rpc("list_students", {
      page_number: 1,
      page_size: 10,
    });
    expect(list.data).toEqual([]);
    const mutation = await revoked.rpc("create_guardian", {
      first_name: "Revoked",
      middle_name: "",
      last_name: "Denied",
      phone: "",
      email: "",
    });
    expect(mutation.error?.code).toBe("42501");
  });

  it("successful workflow events are appended exactly once", async () => {
    const rows = await database.query<{ action: string; count: string }>(
      `select action,count(*) from public.audit_logs where entity_id=$1 group by action`,
      [admittedStudentId],
    );
    expect(
      rows.rows.find((row) => row.action === "STUDENT_CREATED")?.count,
    ).toBe("1");
    expect(
      rows.rows.find((row) => row.action === "STUDENT_STATUS_CHANGED")?.count,
    ).toBe("1");
  });
});
