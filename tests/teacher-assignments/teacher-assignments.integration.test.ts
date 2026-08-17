import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/types/database.generated";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL!;
const password = "synthetic-stage-eight-password";
const nonce = Date.now();
const ids = {
  school: randomUUID(),
  otherSchool: randomUUID(),
  year: randomUUID(),
  otherYear: randomUUID(),
  term: randomUUID(),
  otherTerm: randomUUID(),
  grade: randomUUID(),
  otherGrade: randomUUID(),
  class: randomUUID(),
  secondClass: randomUUID(),
  thirdClass: randomUUID(),
  otherClass: randomUUID(),
  subject: randomUUID(),
  secondSubject: randomUUID(),
  otherSubject: randomUUID(),
  student: randomUUID(),
  enrollment: randomUUID(),
};
const database = new Client({ connectionString: databaseUrl });
const admin = createClient<Database>(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});
type Role = Database["public"]["Enums"]["staff_role"];
type MembershipStatus = Database["public"]["Enums"]["membership_status"];
type ClientType = SupabaseClient<Database>;
type Identity = { email: string; userId: string; memberships: string[] };
const people = new Map<string, Identity>();
const noDate = null as unknown as string;
let registrar: ClientType;
let subjectAssignmentId = "";
let subjectAssignmentUpdatedAt = "";
let classAssignmentId = "";
let mismatchedRoleAssignmentId = "";

function isoDate(offset = 0) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

async function addPerson(
  key: string,
  role: Role,
  schoolId = ids.school,
  status: MembershipStatus = "ACTIVE",
  revoked = false,
) {
  const email = `assignment.${key}.${nonce}@example.invalid`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const membershipId = randomUUID();
  await database.query(
    "insert into public.profiles (id,first_name,last_name) values ($1,$2,'Teacher')",
    [created.data.user.id, key],
  );
  await database.query(
    "insert into public.school_staff_memberships (id,school_id,profile_id,employee_number,status) values ($1,$2,$3,$4,$5)",
    [
      membershipId,
      schoolId,
      created.data.user.id,
      `ASSIGN-${key}-${nonce}`,
      status,
    ],
  );
  await database.query(
    "insert into public.staff_role_assignments (membership_id,role,granted_at,revoked_at) values ($1,$2,now() - interval '1 day',case when $3 then now() else null end)",
    [membershipId, role, revoked],
  );
  people.set(key, {
    email,
    userId: created.data.user.id,
    memberships: [membershipId],
  });
  return membershipId;
}

async function addMembership(key: string, schoolId: string, role: Role) {
  const person = people.get(key)!;
  const membershipId = randomUUID();
  await database.query(
    "insert into public.school_staff_memberships (id,school_id,profile_id,employee_number,status) values ($1,$2,$3,$4,'ACTIVE')",
    [membershipId, schoolId, person.userId, `ASSIGN-${key}-OTHER-${nonce}`],
  );
  await database.query(
    "insert into public.staff_role_assignments (membership_id,role,granted_at) values ($1,$2,now() - interval '1 day')",
    [membershipId, role],
  );
  person.memberships.push(membershipId);
  return membershipId;
}

async function signedIn(key: string, membershipIndex = 0) {
  const person = people.get(key)!;
  const client = createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const login = await client.auth.signInWithPassword({
    email: person.email,
    password,
  });
  if (login.error) throw login.error;
  const selected = await client.rpc("set_my_active_membership", {
    target_membership_id: person.memberships[membershipIndex]!,
  });
  if (selected.error) throw selected.error;
  return client;
}

function teachingArgs(
  membershipId: string,
  overrides: Partial<
    Database["public"]["Functions"]["create_teaching_assignment"]["Args"]
  > = {},
) {
  return {
    target_term_id: ids.term,
    target_class_section_id: ids.class,
    target_subject_id: ids.subject,
    target_staff_membership_id: membershipId,
    assignment_starts_on: "2026-01-01",
    assignment_ends_on: noDate,
    ...overrides,
  };
}

describe.sequential("teacher assignment management", () => {
  beforeAll(async () => {
    await database.connect();
    await database.query(
      "insert into public.schools (id,name,slug,school_code) values ($1,$2,$3,$4),($5,$6,$7,$8)",
      [
        ids.school,
        `Assignment School ${nonce}`,
        `assignment-${nonce}`,
        `AS-${nonce}`,
        ids.otherSchool,
        `Other Assignment School ${nonce}`,
        `assignment-other-${nonce}`,
        `AO-${nonce}`,
      ],
    );
    await database.query(
      "insert into public.academic_years (id,school_id,name,starts_on,ends_on,status) values ($1,$2,'2026','2026-01-01','2026-12-31','ACTIVE'),($3,$4,'2026 Other','2026-01-01','2026-12-31','ACTIVE')",
      [ids.year, ids.school, ids.otherYear, ids.otherSchool],
    );
    await database.query(
      "insert into public.terms (id,academic_year_id,name,term_number,starts_on,ends_on,status) values ($1,$2,'Full Year',1,'2026-01-01','2026-12-31','OPEN'),($3,$4,'Other Full Year',1,'2026-01-01','2026-12-31','OPEN')",
      [ids.term, ids.year, ids.otherTerm, ids.otherYear],
    );
    await database.query(
      "insert into public.grade_levels (id,school_id,code,name,sort_order) values ($1,$2,'P1','Primary One',1),($3,$4,'P1','Other Primary One',1)",
      [ids.grade, ids.school, ids.otherGrade, ids.otherSchool],
    );
    await database.query(
      "insert into public.class_sections (id,academic_year_id,grade_level_id,name,class_code) values ($1,$2,$3,'P1 North','P1-N'),($4,$2,$3,'P1 South','P1-S'),($5,$2,$3,'P1 East','P1-E'),($6,$7,$8,'Other P1','OP1')",
      [
        ids.class,
        ids.year,
        ids.grade,
        ids.secondClass,
        ids.thirdClass,
        ids.otherClass,
        ids.otherYear,
        ids.otherGrade,
      ],
    );
    await database.query(
      "insert into public.subjects (id,school_id,code,name,sort_order) values ($1,$2,'ENG','English',1),($3,$2,'MTH','Mathematics',2),($4,$5,'OTH','Other Subject',1)",
      [
        ids.subject,
        ids.school,
        ids.secondSubject,
        ids.otherSubject,
        ids.otherSchool,
      ],
    );
    await database.query(
      "insert into public.grade_level_subjects (grade_level_id,subject_id,sort_order) values ($1,$2,1),($1,$3,2),($4,$5,1)",
      [
        ids.grade,
        ids.subject,
        ids.secondSubject,
        ids.otherGrade,
        ids.otherSubject,
      ],
    );
    await database.query(
      "insert into public.students (id,school_id,admission_number,first_name,last_name,admission_date) values ($1,$2,$3,'Assigned','Learner','2026-01-05')",
      [ids.student, ids.school, `ASSIGN-STUDENT-${nonce}`],
    );
    await database.query(
      "insert into public.enrollments (id,student_id,academic_year_id,class_section_id,status,enrolled_on) values ($1,$2,$3,$4,'ACTIVE','2026-01-05')",
      [ids.enrollment, ids.student, ids.year, ids.class],
    );
    await addPerson("registrar", "ACADEMIC_REGISTRAR");
    await addPerson("head", "HEAD_TEACHER");
    await addPerson("subject", "SUBJECT_TEACHER");
    await addPerson("subject2", "SUBJECT_TEACHER");
    await addPerson("class", "CLASS_TEACHER");
    await addPerson("class2", "CLASS_TEACHER");
    await addPerson("class3", "CLASS_TEACHER");
    await addPerson("class4", "CLASS_TEACHER");
    await addPerson("class5", "CLASS_TEACHER");
    await addPerson("wrong", "HEAD_TEACHER");
    await addPerson("revoked", "SUBJECT_TEACHER", ids.school, "ACTIVE", true);
    await addPerson("suspended", "SUBJECT_TEACHER", ids.school, "SUSPENDED");
    await addPerson("multi", "SUBJECT_TEACHER");
    const multiOther = await addMembership(
      "multi",
      ids.otherSchool,
      "SUBJECT_TEACHER",
    );
    await database.query(
      "insert into public.teaching_assignments (term_id,class_section_id,subject_id,staff_membership_id,starts_on) values ($1,$2,$3,$4,'2026-01-01')",
      [ids.otherTerm, ids.otherClass, ids.otherSubject, multiOther],
    );
    const mismatchedRole = await database.query(
      "insert into public.teaching_assignments (term_id,class_section_id,subject_id,staff_membership_id,starts_on) values ($1,$2,$3,$4,'2026-01-01') returning id",
      [
        ids.term,
        ids.secondClass,
        ids.secondSubject,
        people.get("class")!.memberships[0],
      ],
    );
    mismatchedRoleAssignmentId = mismatchedRole.rows[0]!.id;
    registrar = await signedIn("registrar");
  });

  afterAll(async () => database.end());

  it("registrar creates a valid subject assignment", async () => {
    const response = await registrar.rpc(
      "create_teaching_assignment",
      teachingArgs(people.get("subject")!.memberships[0]!),
    );
    expect(response.error).toBeNull();
    subjectAssignmentId = response.data![0]!.assignment_id;
    subjectAssignmentUpdatedAt = response.data![0]!.updated_at;
  });

  it("registrar creates a class-teacher assignment", async () => {
    const response = await registrar.rpc("create_class_teacher_assignment", {
      target_term_id: ids.term,
      target_class_section_id: ids.class,
      target_staff_membership_id: people.get("class")!.memberships[0]!,
      assignment_is_primary: true,
      assignment_starts_on: "2026-01-01",
      assignment_ends_on: noDate,
    });
    expect(response.error).toBeNull();
    classAssignmentId = response.data![0]!.assignment_id;
  });

  it("head teacher has schoolwide read-only access", async () => {
    const head = await signedIn("head");
    const read = await head.rpc("list_teaching_assignments", {
      filter_academic_year_id: noDate,
      filter_term_id: noDate,
      filter_grade_level_id: noDate,
      filter_class_section_id: noDate,
      filter_subject_id: noDate,
      filter_staff_membership_id: noDate,
      filter_period: noDate,
      page_number: 1,
      page_size: 25,
    });
    const write = await head.rpc(
      "create_teaching_assignment",
      teachingArgs(people.get("subject2")!.memberships[0]!),
    );
    expect(
      read.data?.some((row) => row.assignment_id === subjectAssignmentId),
    ).toBe(true);
    expect(write.error?.code).toBe("42501");
  });

  it("class teacher sees only own selected-membership records", async () => {
    const client = await signedIn("class");
    const result = await client.rpc("get_my_teacher_assignments");
    expect(result.error).toBeNull();
    expect(result.data?.every((row) => row.assignment_type === "CLASS")).toBe(
      true,
    );
    expect(
      result.data?.some((row) => row.assignment_id === classAssignmentId),
    ).toBe(true);
  });

  it("own-list and detail RPCs require the matching live teacher role", async () => {
    const client = await signedIn("class");
    const list = await client.rpc("list_teaching_assignments", {
      filter_academic_year_id: noDate,
      filter_term_id: noDate,
      filter_grade_level_id: noDate,
      filter_class_section_id: noDate,
      filter_subject_id: noDate,
      filter_staff_membership_id: noDate,
      filter_period: noDate,
      page_number: 1,
      page_size: 25,
    });
    const detail = await client.rpc("get_teaching_assignment", {
      target_assignment_id: mismatchedRoleAssignmentId,
    });
    expect(list.error).toBeNull();
    expect(list.data).toEqual([]);
    expect(detail.error).toBeNull();
    expect(detail.data).toEqual([]);
  });

  it("subject teacher sees only own selected-membership records", async () => {
    const client = await signedIn("subject");
    const result = await client.rpc("get_my_teacher_assignments");
    expect(result.error).toBeNull();
    expect(result.data?.map((row) => row.assignment_id)).toEqual([
      subjectAssignmentId,
    ]);
  });

  it("teacher with two school memberships cannot union assignments", async () => {
    const client = await signedIn("multi", 0);
    const result = await client.rpc("get_my_teacher_assignments");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });

  it("switching selected membership changes assignment visibility", async () => {
    const client = await signedIn("multi", 0);
    await client.rpc("set_my_active_membership", {
      target_membership_id: people.get("multi")!.memberships[1]!,
    });
    const result = await client.rpc("get_my_teacher_assignments");
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(result.data![0]!.class_name).toBe("Other P1");
  });

  it("cross-school forged IDs fail", async () => {
    const result = await registrar.rpc(
      "create_teaching_assignment",
      teachingArgs(people.get("subject2")!.memberships[0]!, {
        target_term_id: ids.otherTerm,
        target_class_section_id: ids.otherClass,
        target_subject_id: ids.otherSubject,
      }),
    );
    expect(result.error).not.toBeNull();
  });

  it("wrong-role membership fails", async () => {
    const result = await registrar.rpc(
      "create_teaching_assignment",
      teachingArgs(people.get("wrong")!.memberships[0]!, {
        target_subject_id: ids.secondSubject,
      }),
    );
    expect(result.error?.message).toContain("ROLE_REQUIRED");
  });

  it("revoked teacher role fails immediately", async () => {
    const result = await registrar.rpc(
      "create_teaching_assignment",
      teachingArgs(people.get("revoked")!.memberships[0]!, {
        target_subject_id: ids.secondSubject,
      }),
    );
    expect(result.error?.message).toContain("ROLE_REQUIRED");
  });

  it("suspended membership fails immediately", async () => {
    const result = await registrar.rpc(
      "create_teaching_assignment",
      teachingArgs(people.get("suspended")!.memberships[0]!, {
        target_subject_id: ids.secondSubject,
      }),
    );
    expect(result.error?.message).toContain("TEACHER_INACTIVE");
  });

  it("future assignment is upcoming and grants no current student scope", async () => {
    const response = await registrar.rpc(
      "create_teaching_assignment",
      teachingArgs(people.get("subject2")!.memberships[0]!, {
        target_subject_id: ids.secondSubject,
        assignment_starts_on: isoDate(1),
      }),
    );
    expect(response.error).toBeNull();
    const teacher = await signedIn("subject2");
    const own = await teacher.rpc("get_my_teacher_assignments");
    expect(own.error).toBeNull();
    const students = await teacher
      .from("students")
      .select("id")
      .eq("id", ids.student);
    expect(own.data?.[0]?.period_status).toBe("UPCOMING");
    expect(students.data).toEqual([]);
  });

  it("current assignment grants expected student scope", async () => {
    const teacher = await signedIn("subject");
    const students = await teacher
      .from("students")
      .select("id")
      .eq("id", ids.student);
    expect(students.data?.[0]?.id).toBe(ids.student);
  });

  it("ending an assignment removes current scope", async () => {
    const ended = await registrar.rpc("end_teaching_assignment", {
      target_assignment_id: subjectAssignmentId,
      expected_updated_at: subjectAssignmentUpdatedAt,
      assignment_ends_on: isoDate(-1),
      reason: "Teaching responsibility changed",
    });
    expect(ended.error).toBeNull();
    const teacher = await signedIn("subject");
    const students = await teacher
      .from("students")
      .select("id")
      .eq("id", ids.student);
    expect(students.data).toEqual([]);
  });

  it("primary replacement is atomic and preserves history", async () => {
    const response = await registrar.rpc("replace_primary_class_teacher", {
      target_term_id: ids.term,
      target_class_section_id: ids.class,
      target_staff_membership_id: people.get("class2")!.memberships[0]!,
      replacement_starts_on: isoDate(1),
      reason: "Planned staffing transition",
    });
    expect(response.error).toBeNull();
    const rows = await database.query(
      "select starts_on::text,ends_on::text,staff_membership_id from public.class_teacher_assignments where term_id=$1 and class_section_id=$2 and is_primary order by starts_on",
      [ids.term, ids.class],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]!.ends_on).toBe(isoDate(0));
  });

  it("concurrent primary replacements leave one valid primary", async () => {
    await database.query(
      "insert into public.class_teacher_assignments (term_id,class_section_id,staff_membership_id,is_primary,starts_on) values ($1,$2,$3,true,'2026-01-01')",
      [ids.term, ids.secondClass, people.get("class")!.memberships[0]],
    );
    const clients = [await signedIn("registrar"), await signedIn("registrar")];
    const results = await Promise.all(
      clients.map((client, index) =>
        client.rpc("replace_primary_class_teacher", {
          target_term_id: ids.term,
          target_class_section_id: ids.secondClass,
          target_staff_membership_id: people.get(index ? "class3" : "class2")!
            .memberships[0]!,
          replacement_starts_on: isoDate(2),
          reason: "Concurrent replacement test",
        }),
      ),
    );
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    const effective = await database.query(
      "select count(*)::int count from public.class_teacher_assignments where term_id=$1 and class_section_id=$2 and is_primary and $3::date between starts_on and coalesce(ends_on,'infinity'::date)",
      [ids.term, ids.secondClass, isoDate(2)],
    );
    expect(effective.rows[0]!.count).toBe(1);
  });

  it("concurrent duplicate subject assignments do not create duplicates", async () => {
    const args = teachingArgs(people.get("multi")!.memberships[0]!, {
      target_class_section_id: ids.thirdClass,
    });
    const clients = [await signedIn("registrar"), await signedIn("registrar")];
    const results = await Promise.all(
      clients.map((client) => client.rpc("create_teaching_assignment", args)),
    );
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    const count = await database.query(
      "select count(*)::int count from public.teaching_assignments where term_id=$1 and class_section_id=$2 and subject_id=$3 and staff_membership_id=$4",
      [
        ids.term,
        ids.thirdClass,
        ids.subject,
        people.get("multi")!.memberships[0],
      ],
    );
    expect(count.rows[0]!.count).toBe(1);
  });

  it("assistant teachers may coexist but one teacher cannot overlap itself", async () => {
    const base = {
      target_term_id: ids.term,
      target_class_section_id: ids.thirdClass,
      assignment_is_primary: false,
      assignment_starts_on: "2026-02-01",
      assignment_ends_on: "2026-02-28",
    };
    const first = await registrar.rpc("create_class_teacher_assignment", {
      ...base,
      target_staff_membership_id: people.get("class4")!.memberships[0]!,
    });
    const coexisting = await registrar.rpc("create_class_teacher_assignment", {
      ...base,
      target_staff_membership_id: people.get("class5")!.memberships[0]!,
    });
    const duplicate = await registrar.rpc("create_class_teacher_assignment", {
      ...base,
      assignment_starts_on: "2026-02-15",
      target_staff_membership_id: people.get("class4")!.memberships[0]!,
    });
    expect(first.error).toBeNull();
    expect(coexisting.error).toBeNull();
    expect(duplicate.error?.message).toContain(
      "CLASS_TEACHER_ASSIGNMENT_OVERLAP",
    );
  });

  it("stale edits fail without a false success audit", async () => {
    const created = await registrar.rpc("create_class_teacher_assignment", {
      target_term_id: ids.term,
      target_class_section_id: ids.thirdClass,
      target_staff_membership_id: people.get("class3")!.memberships[0]!,
      assignment_is_primary: false,
      assignment_starts_on: "2026-01-01",
      assignment_ends_on: noDate,
    });
    const row = created.data![0]!;
    await registrar.rpc("update_class_teacher_assignment", {
      target_assignment_id: row.assignment_id,
      expected_updated_at: row.updated_at,
      assignment_starts_on: "2026-01-02",
      assignment_ends_on: noDate,
    });
    const before = await database.query(
      "select count(*)::int count from public.audit_logs where entity_id=$1",
      [row.assignment_id],
    );
    const stale = await registrar.rpc("update_class_teacher_assignment", {
      target_assignment_id: row.assignment_id,
      expected_updated_at: row.updated_at,
      assignment_starts_on: "2026-01-03",
      assignment_ends_on: noDate,
    });
    const after = await database.query(
      "select count(*)::int count from public.audit_logs where entity_id=$1",
      [row.assignment_id],
    );
    expect(stale.error?.code).toBe("PT409");
    expect(after.rows[0]!.count).toBe(before.rows[0]!.count);
  });

  it("direct table writes remain denied", async () => {
    const client = await signedIn("registrar");
    const result = await client.from("teaching_assignments").insert({
      term_id: ids.term,
      class_section_id: ids.thirdClass,
      subject_id: ids.secondSubject,
      staff_membership_id: people.get("subject")!.memberships[0]!,
      starts_on: "2026-01-01",
    });
    expect(result.error?.code).toBe("42501");
  });

  it("assignment RPC results expose no staff contacts", async () => {
    const head = await signedIn("head");
    const assignments = await head.rpc("list_class_teacher_assignments", {
      filter_academic_year_id: noDate,
      filter_term_id: noDate,
      filter_grade_level_id: noDate,
      filter_class_section_id: noDate,
      filter_staff_membership_id: noDate,
      filter_primary: null as unknown as boolean,
      filter_period: noDate,
      page_number: 1,
      page_size: 100,
    });
    const directory = await head.rpc("list_assignment_teachers");
    const eligible = await registrar.rpc("list_eligible_subject_teachers", {
      target_term_id: ids.term,
      target_class_section_id: ids.class,
      target_subject_id: ids.subject,
      assignment_starts_on: "2026-03-01",
      assignment_ends_on: "2026-03-31",
    });
    expect(assignments.error).toBeNull();
    expect(directory.error).toBeNull();
    expect(eligible.error).toBeNull();
    const serialized = JSON.stringify([
      ...(assignments.data ?? []),
      ...(directory.data ?? []),
      ...(eligible.data ?? []),
    ]);
    expect(serialized).not.toMatch(/email|phone|profile_id|auth/i);
  });
});
