import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/types/database.generated";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL!;
const password = "synthetic-stage-nine-password";
const nonce = Date.now();
type ClientType = SupabaseClient<Database>;
type Role = Database["public"]["Enums"]["staff_role"];
const ids = Object.fromEntries(
  [
    "school",
    "otherSchool",
    "year",
    "otherYear",
    "term",
    "otherTerm",
    "grade",
    "otherGrade",
    "class",
    "otherClass",
    "subject",
    "otherSubject",
    "scheme",
    "componentA",
    "componentB",
    "student",
    "otherStudent",
    "enrollment",
    "otherEnrollment",
    "assignment",
    "futureAssignment",
    "endedAssignment",
    "teacherOtherMembership",
    "teacherOtherRole",
  ].map((key) => [key, randomUUID()]),
) as Record<string, string>;
const database = new Client({ connectionString: databaseUrl });
const admin = createClient<Database>(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});
const people = new Map<
  string,
  { email: string; userId: string; membershipId: string; roleId: string }
>();
let teacher: ClientType;
let otherTeacher: ClientType;
let futureTeacher: ClientType;
let endedTeacher: ClientType;
let viewer: ClientType;
let markSheetId = "";
let firstVersion = 0;

async function addPerson(key: string, role: Role, schoolId = ids.school) {
  const email = `marks.${key}.${nonce}@example.invalid`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const membershipId = randomUUID();
  const roleId = randomUUID();
  await database.query(
    "insert into public.profiles (id,first_name,last_name) values ($1,$2,'Synthetic')",
    [created.data.user.id, key],
  );
  await database.query(
    "insert into public.school_staff_memberships (id,school_id,profile_id,employee_number,status,joined_at) values ($1,$2,$3,$4,'ACTIVE','2026-01-01')",
    [membershipId, schoolId, created.data.user.id, `MARK-${key}-${nonce}`],
  );
  await database.query(
    "insert into public.staff_role_assignments (id,membership_id,role,granted_at) values ($1,$2,$3,now()-interval '1 day')",
    [roleId, membershipId, role],
  );
  people.set(key, {
    email,
    userId: created.data.user.id,
    membershipId,
    roleId,
  });
  return membershipId;
}

async function signIn(key: string) {
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
    target_membership_id: person.membershipId,
  });
  if (selected.error) throw selected.error;
  return client;
}

function entry(
  overrides: Partial<
    Database["public"]["Functions"]["save_mark_entry"]["Args"]
  > = {},
) {
  return {
    target_mark_sheet_id: markSheetId,
    target_assessment_component_id: ids.componentA,
    target_enrollment_id: ids.enrollment,
    expected_row_version: 0,
    entered_score: 40,
    entered_attendance_status: "PRESENT" as const,
    entered_teacher_remark: null as unknown as string,
    ...overrides,
  };
}

async function openControlConnection(label: string) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query("select set_config('application_name',$1,false)", [
    `marks-race-${label}-${nonce}`,
  ]);
  return client;
}

async function waitForBlockedBackend(options: {
  applicationName?: string;
  queryFragment?: string;
}) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await database.query<{ blocked: boolean }>(
      `select exists (
         select 1
         from pg_catalog.pg_stat_activity
         where wait_event_type = 'Lock'
           and ($1::text is null or application_name = $1)
           and ($2::text is null or query ilike '%' || $2 || '%')
       ) as blocked`,
      [options.applicationName ?? null, options.queryFragment ?? null],
    );
    if (result.rows[0].blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `Timed out waiting for blocked backend ${JSON.stringify(options)}`,
  );
}

async function cellSnapshot() {
  const result = await database.query<{
    score: string | null;
    row_version: number;
  }>(
    `select score, row_version
     from public.marks
     where mark_sheet_id=$1
       and assessment_component_id=$2
       and enrollment_id=$3`,
    [markSheetId, ids.componentA, ids.enrollment],
  );
  return {
    score: result.rows[0].score === null ? null : Number(result.rows[0].score),
    rowVersion: result.rows[0].row_version,
  };
}

async function successAuditCount() {
  const result = await database.query<{ count: number }>(
    `select count(*)::int as count
     from public.audit_logs
     where entity_id=$1
        or new_values->>'mark_sheet_id'=$1::text`,
    [markSheetId],
  );
  return result.rows[0].count;
}

async function authorityChangeWins(options: {
  label: string;
  changeSql: string;
  changeParams: unknown[];
  restoreSql: string;
  restoreParams: unknown[];
  expectedCode: string;
  restoreBypassTriggers?: boolean;
}) {
  const control = await openControlConnection(options.label);
  let committed = false;
  const beforeCell = await cellSnapshot();
  const beforeAudits = await successAuditCount();
  try {
    await control.query("begin");
    await control.query(options.changeSql, options.changeParams);
    const save = Promise.resolve(
      teacher.rpc(
        "save_mark_entry",
        entry({
          expected_row_version: firstVersion,
          entered_score: 43,
        }),
      ),
    );
    await waitForBlockedBackend({ queryFragment: "save_mark_entry" });
    await control.query("commit");
    committed = true;

    const result = await save;
    expect(result.error?.code).toBe(options.expectedCode);
    expect(await cellSnapshot()).toEqual(beforeCell);
    expect(await successAuditCount()).toBe(beforeAudits);
  } finally {
    if (!committed) await control.query("rollback");
    await control.end();
    if (options.restoreBypassTriggers) {
      await database.query("begin");
      try {
        await database.query("set local session_replication_role=replica");
        await database.query(options.restoreSql, options.restoreParams);
        await database.query("commit");
      } catch (error) {
        await database.query("rollback");
        throw error;
      }
    } else {
      await database.query(options.restoreSql, options.restoreParams);
    }
  }
}

describe.sequential("secure marks entry", () => {
  beforeAll(async () => {
    await database.connect();
    await database.query(
      "insert into public.schools (id,name,slug,school_code) values ($1,$2,$3,$4),($5,$6,$7,$8)",
      [
        ids.school,
        `Marks School ${nonce}`,
        `marks-${nonce}`,
        `MS-${nonce}`,
        ids.otherSchool,
        `Other Marks School ${nonce}`,
        `other-marks-${nonce}`,
        `OMS-${nonce}`,
      ],
    );
    const teacherId = await addPerson("teacher", "SUBJECT_TEACHER");
    const otherTeacherId = await addPerson("other", "SUBJECT_TEACHER");
    const futureTeacherId = await addPerson("future", "SUBJECT_TEACHER");
    const endedTeacherId = await addPerson("ended", "SUBJECT_TEACHER");
    await addPerson("viewer", "HEAD_TEACHER");
    const teacherPerson = people.get("teacher")!;
    await database.query(
      "insert into public.school_staff_memberships (id,school_id,profile_id,employee_number,status,joined_at) values ($1,$2,$3,$4,'ACTIVE','2026-01-01')",
      [
        ids.teacherOtherMembership,
        ids.otherSchool,
        teacherPerson.userId,
        `MARK-teacher-other-${nonce}`,
      ],
    );
    await database.query(
      "insert into public.staff_role_assignments (id,membership_id,role,granted_at) values ($1,$2,'SUBJECT_TEACHER',now()-interval '1 day')",
      [ids.teacherOtherRole, ids.teacherOtherMembership],
    );
    await database.query(
      "insert into public.academic_years (id,school_id,name,starts_on,ends_on,status) values ($1,$2,'Current window',current_date-180,current_date+180,'ACTIVE'),($3,$4,'Other current window',current_date-180,current_date+180,'ACTIVE')",
      [ids.year, ids.school, ids.otherYear, ids.otherSchool],
    );
    await database.query(
      "insert into public.terms (id,academic_year_id,name,term_number,starts_on,ends_on,status) values ($1,$2,'Current window',1,current_date-180,current_date+180,'MARKS_ENTRY'),($3,$4,'Other current window',1,current_date-180,current_date+180,'MARKS_ENTRY')",
      [ids.term, ids.year, ids.otherTerm, ids.otherYear],
    );
    await database.query(
      "insert into public.grade_levels (id,school_id,code,name,sort_order) values ($1,$2,'P1','Primary One',1),($3,$4,'P1','Other Primary One',1)",
      [ids.grade, ids.school, ids.otherGrade, ids.otherSchool],
    );
    await database.query(
      "insert into public.class_sections (id,academic_year_id,grade_level_id,name,class_code) values ($1,$2,$3,'P1 North','P1-N'),($4,$5,$6,'Other P1','OP1')",
      [
        ids.class,
        ids.year,
        ids.grade,
        ids.otherClass,
        ids.otherYear,
        ids.otherGrade,
      ],
    );
    await database.query(
      "insert into public.subjects (id,school_id,code,name,sort_order) values ($1,$2,'ENG','English',1),($3,$4,'OTH','Other Subject',1)",
      [ids.subject, ids.school, ids.otherSubject, ids.otherSchool],
    );
    await database.query(
      "insert into public.grade_level_subjects (grade_level_id,subject_id,sort_order) values ($1,$2,1)",
      [ids.grade, ids.subject],
    );
    await database.query(
      "insert into public.assessment_schemes (id,term_id,grade_level_id,subject_id,name,version,status,effective_from) values ($1,$2,$3,$4,'Continuous assessment',1,'DRAFT',current_date-180)",
      [ids.scheme, ids.term, ids.grade, ids.subject],
    );
    await database.query(
      "insert into public.assessment_components (id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values ($1,$2,'Coursework','CW',50,50,1),($3,$2,'Exam','EX',100,50,2)",
      [ids.componentA, ids.scheme, ids.componentB],
    );
    await database.query(
      "update public.assessment_schemes set status='ACTIVE' where id=$1",
      [ids.scheme],
    );
    await database.query(
      "insert into public.students (id,school_id,admission_number,first_name,last_name,admission_date) values ($1,$2,$3,'Ada','Learner',current_date-180),($4,$5,$6,'Other','Learner',current_date-180)",
      [
        ids.student,
        ids.school,
        `ADM-${nonce}`,
        ids.otherStudent,
        ids.otherSchool,
        `OTHER-${nonce}`,
      ],
    );
    await database.query(
      "insert into public.enrollments (id,student_id,academic_year_id,class_section_id,class_number,status,enrolled_on) values ($1,$2,$3,$4,'1','ACTIVE',current_date-180),($5,$6,$7,$8,'1','ACTIVE',current_date-180)",
      [
        ids.enrollment,
        ids.student,
        ids.year,
        ids.class,
        ids.otherEnrollment,
        ids.otherStudent,
        ids.otherYear,
        ids.otherClass,
      ],
    );
    await database.query(
      "insert into public.teaching_assignments (id,term_id,class_section_id,subject_id,staff_membership_id,starts_on,ends_on,is_active) values ($1,$2,$3,$4,$5,current_date-30,null,true),($6,$2,$3,$4,$7,current_date-30,null,true),($8,$2,$3,$4,$9,current_date+30,null,true),($10,$2,$3,$4,$11,current_date-60,current_date-1,false)",
      [
        ids.assignment,
        ids.term,
        ids.class,
        ids.subject,
        teacherId,
        randomUUID(),
        otherTeacherId,
        ids.futureAssignment,
        futureTeacherId,
        ids.endedAssignment,
        endedTeacherId,
      ],
    );
    [teacher, otherTeacher, futureTeacher, endedTeacher, viewer] =
      await Promise.all([
        signIn("teacher"),
        signIn("other"),
        signIn("future"),
        signIn("ended"),
        signIn("viewer"),
      ]);
  });

  afterAll(async () => {
    await database.end();
  });

  it("lists only the selected membership current subject assignment", async () => {
    const r = await teacher.rpc("list_my_mark_sheets");
    expect(r.error).toBeNull();
    expect(r.data?.map((x) => x.teaching_assignment_id)).toEqual([
      ids.assignment,
    ]);
  });
  it("creates a DRAFT sheet from the assignment", async () => {
    const r = await teacher.rpc("get_or_create_draft_mark_sheet", {
      target_teaching_assignment_id: ids.assignment,
    });
    expect(r.error).toBeNull();
    markSheetId = r.data![0].mark_sheet_id;
    expect(r.data![0]).toMatchObject({
      workflow_status: "DRAFT",
      sheet_version: 1,
      created: true,
    });
  });
  it("opens the same sheet idempotently", async () => {
    const r = await teacher.rpc("get_or_create_draft_mark_sheet", {
      target_teaching_assignment_id: ids.assignment,
    });
    expect(r.data![0]).toMatchObject({
      mark_sheet_id: markSheetId,
      created: false,
    });
  });
  it("concurrent opens do not create duplicate drafts", async () => {
    const [a, b] = await Promise.all([
      teacher.rpc("get_or_create_draft_mark_sheet", {
        target_teaching_assignment_id: ids.assignment,
      }),
      teacher.rpc("get_or_create_draft_mark_sheet", {
        target_teaching_assignment_id: ids.assignment,
      }),
    ]);
    expect(a.data![0].mark_sheet_id).toBe(b.data![0].mark_sheet_id);
  });
  it("binds the active compatible assessment scheme", async () => {
    const r = await database.query(
      "select assessment_scheme_id from public.mark_sheets where id=$1",
      [markSheetId],
    );
    expect(r.rows[0].assessment_scheme_id).toBe(ids.scheme);
  });
  it("returns ordered authoritative components", async () => {
    const r = await teacher.rpc("get_mark_entry_grid", {
      target_mark_sheet_id: markSheetId,
    });
    expect(r.data![0].components as unknown[]).toHaveLength(2);
    expect(
      (r.data![0].components as { componentCode: string }[])[0].componentCode,
    ).toBe("CW");
  });
  it("returns the authoritative eligible roster", async () => {
    const r = await teacher.rpc("get_mark_entry_grid", {
      target_mark_sheet_id: markSheetId,
    });
    expect(
      (r.data![0].roster as { enrollmentId: string }[]).map(
        (x) => x.enrollmentId,
      ),
    ).toEqual([ids.enrollment]);
  });
  it("saves a valid score", async () => {
    const r = await teacher.rpc("save_mark_entry", entry());
    expect(r.error).toBeNull();
    firstVersion = r.data![0].row_version;
    expect(r.data![0].score).toBe(40);
  });
  it("updates and preserves a genuine zero", async () => {
    const r = await teacher.rpc(
      "save_mark_entry",
      entry({ expected_row_version: firstVersion, entered_score: 0 }),
    );
    expect(r.error).toBeNull();
    firstVersion = r.data![0].row_version;
    expect(r.data![0].score).toBe(0);
  });
  it("stores absence without a fake zero", async () => {
    const r = await teacher.rpc(
      "save_mark_entry",
      entry({
        expected_row_version: firstVersion,
        entered_score: null as unknown as number,
        entered_attendance_status: "ABSENT",
      }),
    );
    expect(r.error).toBeNull();
    firstVersion = r.data![0].row_version;
    expect(r.data![0]).toMatchObject({
      score: null,
      attendance_status: "ABSENT",
    });
  });
  it("normalizes a teacher remark", async () => {
    const r = await teacher.rpc(
      "save_mark_entry",
      entry({
        expected_row_version: firstVersion,
        entered_score: 41,
        entered_teacher_remark: "  Improving  ",
      }),
    );
    expect(r.error).toBeNull();
    firstVersion = r.data![0].row_version;
    expect(r.data![0].teacher_remark).toBe("Improving");
  });
  it("saves multiple dirty cells atomically", async () => {
    const r = await teacher.rpc("save_mark_entries", {
      target_mark_sheet_id: markSheetId,
      entries: [
        {
          assessmentComponentId: ids.componentA,
          enrollmentId: ids.enrollment,
          expectedRowVersion: firstVersion,
          score: 42,
          attendanceStatus: "PRESENT",
          teacherRemark: null,
        },
        {
          assessmentComponentId: ids.componentB,
          enrollmentId: ids.enrollment,
          expectedRowVersion: null,
          score: 80,
          attendanceStatus: "PRESENT",
          teacherRemark: null,
        },
      ],
    });
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(2);
    firstVersion = r.data!.find(
      (x) => x.assessment_component_id === ids.componentA,
    )!.row_version;
  });
  it("rejects a stale single-row update", async () => {
    const r = await teacher.rpc(
      "save_mark_entry",
      entry({ expected_row_version: firstVersion - 1 }),
    );
    expect(r.error?.code).toBe("PT409");
  });
  it("rolls back a stale batch", async () => {
    const before = await database.query(
      "select score from public.marks where mark_sheet_id=$1 and assessment_component_id=$2",
      [markSheetId, ids.componentB],
    );
    const r = await teacher.rpc("save_mark_entries", {
      target_mark_sheet_id: markSheetId,
      entries: [
        {
          assessmentComponentId: ids.componentA,
          enrollmentId: ids.enrollment,
          expectedRowVersion: firstVersion - 1,
          score: 2,
          attendanceStatus: "PRESENT",
          teacherRemark: null,
        },
        {
          assessmentComponentId: ids.componentB,
          enrollmentId: ids.enrollment,
          expectedRowVersion: 1,
          score: 2,
          attendanceStatus: "PRESENT",
          teacherRemark: null,
        },
      ],
    });
    expect(r.error?.code).toBe("PT409");
    const after = await database.query(
      "select score from public.marks where mark_sheet_id=$1 and assessment_component_id=$2",
      [markSheetId, ids.componentB],
    );
    expect(after.rows[0].score).toBe(before.rows[0].score);
  });
  it("rejects a score above the component maximum", async () => {
    const r = await teacher.rpc(
      "save_mark_entry",
      entry({ expected_row_version: firstVersion, entered_score: 51 }),
    );
    expect(r.error?.message).toContain("SCORE_ABOVE_MAXIMUM");
  });
  it("rejects a cross-scheme component", async () => {
    const r = await teacher.rpc(
      "save_mark_entry",
      entry({
        target_assessment_component_id: randomUUID(),
        expected_row_version: 0,
      }),
    );
    expect(r.error?.message).toContain("COMPONENT_OUT_OF_SCOPE");
  });
  it("rejects a cross-school enrollment", async () => {
    const r = await teacher.rpc(
      "save_mark_entry",
      entry({
        target_enrollment_id: ids.otherEnrollment,
        expected_row_version: 0,
      }),
    );
    expect(r.error?.message).toContain("ENROLLMENT_OUT_OF_SCOPE");
  });
  it("prevents another subject teacher editing the sheet", async () => {
    const r = await otherTeacher.rpc(
      "save_mark_entry",
      entry({ expected_row_version: firstVersion }),
    );
    expect(r.error?.code).toBe("42501");
  });
  it("prevents a future assignment opening a sheet", async () => {
    const r = await futureTeacher.rpc("get_or_create_draft_mark_sheet", {
      target_teaching_assignment_id: ids.futureAssignment,
    });
    expect(r.error?.code).toBe("42501");
  });
  it("prevents an ended assignment opening a sheet", async () => {
    const r = await endedTeacher.rpc("get_or_create_draft_mark_sheet", {
      target_teaching_assignment_id: ids.endedAssignment,
    });
    expect(r.error?.code).toBe("42501");
  });
  it("role revocation removes entry access", async () => {
    const person = people.get("teacher")!;
    await database.query(
      "update public.staff_role_assignments set revoked_at=now() where id=$1",
      [person.roleId],
    );
    const r = await teacher.rpc(
      "save_mark_entry",
      entry({ expected_row_version: firstVersion }),
    );
    expect(r.error?.code).toBe("42501");
    await database.query(
      "update public.staff_role_assignments set revoked_at=null where id=$1",
      [person.roleId],
    );
  });
  it("membership suspension removes entry access", async () => {
    const person = people.get("teacher")!;
    await database.query(
      "update public.school_staff_memberships set status='SUSPENDED' where id=$1",
      [person.membershipId],
    );
    const r = await teacher.rpc(
      "save_mark_entry",
      entry({ expected_row_version: firstVersion }),
    );
    expect(r.error?.code).toBe("42501");
    await database.query(
      "update public.school_staff_memberships set status='ACTIVE' where id=$1",
      [person.membershipId],
    );
  });
  it("a concurrent role revocation that wins first blocks the mark write", async () => {
    const person = people.get("teacher")!;
    await authorityChangeWins({
      label: "role-wins",
      changeSql:
        "update public.staff_role_assignments set revoked_at=now() where id=$1",
      changeParams: [person.roleId],
      restoreSql:
        "update public.staff_role_assignments set revoked_at=null where id=$1",
      restoreParams: [person.roleId],
      expectedCode: "42501",
    });
  });
  it("a concurrent membership suspension that wins first blocks the mark write", async () => {
    const person = people.get("teacher")!;
    await authorityChangeWins({
      label: "membership-wins",
      changeSql:
        "update public.school_staff_memberships set status='SUSPENDED' where id=$1",
      changeParams: [person.membershipId],
      restoreSql:
        "update public.school_staff_memberships set status='ACTIVE' where id=$1",
      restoreParams: [person.membershipId],
      expectedCode: "42501",
    });
  });
  it("a concurrent school deactivation that wins first blocks the mark write", async () => {
    await authorityChangeWins({
      label: "school-wins",
      changeSql: "update public.schools set is_active=false where id=$1",
      changeParams: [ids.school],
      restoreSql: "update public.schools set is_active=true where id=$1",
      restoreParams: [ids.school],
      expectedCode: "42501",
    });
  });
  it("a concurrent assignment end that wins first blocks the mark write", async () => {
    await authorityChangeWins({
      label: "assignment-wins",
      changeSql:
        "update public.teaching_assignments set ends_on=current_date,is_active=false where id=$1",
      changeParams: [ids.assignment],
      restoreSql:
        "update public.teaching_assignments set ends_on=null,is_active=true where id=$1",
      restoreParams: [ids.assignment],
      expectedCode: "42501",
      // Stage 8 intentionally forbids reactivating historical assignments. The
      // superuser-only reset keeps this synthetic fixture reusable after the
      // real, committed end-state race has been proved.
      restoreBypassTriggers: true,
    });
  });
  it("a concurrent term transition that wins first blocks the mark write", async () => {
    await authorityChangeWins({
      label: "term-wins",
      changeSql: "update public.terms set status='OPEN' where id=$1",
      changeParams: [ids.term],
      restoreSql: "update public.terms set status='MARKS_ENTRY' where id=$1",
      restoreParams: [ids.term],
      expectedCode: "55000",
    });
  });
  it("a concurrent sheet workflow transition that wins first blocks the mark write", async () => {
    await authorityChangeWins({
      label: "sheet-wins",
      changeSql:
        "update public.mark_sheets set workflow_status='SUBMITTED' where id=$1",
      changeParams: [markSheetId],
      restoreSql:
        "update public.mark_sheets set workflow_status='DRAFT' where id=$1",
      restoreParams: [markSheetId],
      expectedCode: "55000",
    });
  });
  it("a concurrent selected-membership switch that wins first blocks the old-school write", async () => {
    const person = people.get("teacher")!;
    const selection = await database.query<{ session_id: string }>(
      "select session_id from internal.staff_session_active_memberships where profile_id=$1 and membership_id=$2",
      [person.userId, person.membershipId],
    );
    await authorityChangeWins({
      label: "selection-wins",
      changeSql:
        "update internal.staff_session_active_memberships set membership_id=$1,updated_at=now() where session_id=$2",
      changeParams: [ids.teacherOtherMembership, selection.rows[0].session_id],
      restoreSql:
        "update internal.staff_session_active_memberships set membership_id=$1,updated_at=now() where session_id=$2",
      restoreParams: [person.membershipId, selection.rows[0].session_id],
      expectedCode: "42501",
    });
  });
  it("a concurrent MARKS_ENTER mapping removal that wins first blocks the mark write", async () => {
    const mapping = await database.query<{ id: string }>(
      "select id from public.role_permissions where role='SUBJECT_TEACHER' and permission='MARKS_ENTER'",
    );
    await authorityChangeWins({
      label: "permission-wins",
      changeSql: "delete from public.role_permissions where id=$1",
      changeParams: [mapping.rows[0].id],
      restoreSql:
        "insert into public.role_permissions (id,role,permission) values ($1,'SUBJECT_TEACHER','MARKS_ENTER') on conflict (role,permission) do nothing",
      restoreParams: [mapping.rows[0].id],
      expectedCode: "42501",
    });
  });
  it("a mark write that owns authority first completes before suspension", async () => {
    const person = people.get("teacher")!;
    const blocker = await openControlConnection("mark-blocker");
    const suspenderName = `marks-race-suspender-${nonce}`;
    const suspender = new Client({ connectionString: databaseUrl });
    await suspender.connect();
    await suspender.query("select set_config('application_name',$1,false)", [
      suspenderName,
    ]);
    const before = await cellSnapshot();
    let blockerCommitted = false;
    let suspensionCommitted = false;
    try {
      await blocker.query("begin");
      await blocker.query(
        "select id from public.marks where mark_sheet_id=$1 and assessment_component_id=$2 and enrollment_id=$3 for update",
        [markSheetId, ids.componentA, ids.enrollment],
      );
      const save = Promise.resolve(
        teacher.rpc(
          "save_mark_entry",
          entry({
            expected_row_version: firstVersion,
            entered_score: 43,
          }),
        ),
      );
      await waitForBlockedBackend({ queryFragment: "save_mark_entry" });

      await suspender.query("begin");
      const suspension = suspender.query(
        "update public.school_staff_memberships set status='SUSPENDED' where id=$1",
        [person.membershipId],
      );
      await waitForBlockedBackend({ applicationName: suspenderName });

      await blocker.query("commit");
      blockerCommitted = true;
      const saved = await save;
      expect(saved.error).toBeNull();
      expect(saved.data![0].row_version).toBe(before.rowVersion + 1);
      expect(saved.data![0].score).toBe(43);
      firstVersion = saved.data![0].row_version;

      await suspension;
      await suspender.query("commit");
      suspensionCommitted = true;
      const subsequent = await teacher.rpc(
        "save_mark_entry",
        entry({ expected_row_version: firstVersion, entered_score: 44 }),
      );
      expect(subsequent.error?.code).toBe("42501");
      expect(await cellSnapshot()).toEqual({
        score: 43,
        rowVersion: before.rowVersion + 1,
      });
    } finally {
      if (!blockerCommitted) await blocker.query("rollback");
      if (!suspensionCommitted) await suspender.query("rollback");
      await blocker.end();
      await suspender.end();
      await database.query(
        "update public.school_staff_memberships set status='ACTIVE' where id=$1",
        [person.membershipId],
      );
    }
  });
  it("schoolwide viewers can read but cannot edit", async () => {
    const list = await viewer.rpc("list_mark_sheets");
    expect(list.data?.some((x) => x.mark_sheet_id === markSheetId)).toBe(true);
    const save = await viewer.rpc(
      "save_mark_entry",
      entry({ expected_row_version: firstVersion }),
    );
    expect(save.error?.code).toBe("42501");
  });
  it("ordinary browser clients cannot write marks directly", async () => {
    const r = await teacher
      .from("marks")
      .update({ score: 1 })
      .eq("mark_sheet_id", markSheetId);
    expect(r.error).not.toBeNull();
  });
  it("a non-DRAFT sheet cannot be edited", async () => {
    await database.query(
      "update public.mark_sheets set workflow_status='SUBMITTED' where id=$1",
      [markSheetId],
    );
    const r = await teacher.rpc(
      "save_mark_entry",
      entry({ expected_row_version: firstVersion }),
    );
    expect(r.error?.message).toContain("SHEET_NOT_DRAFT");
    await database.query(
      "update public.mark_sheets set workflow_status='DRAFT' where id=$1",
      [markSheetId],
    );
  });
  it("duplicate cells reject the entire batch", async () => {
    const cell = {
      assessmentComponentId: ids.componentA,
      enrollmentId: ids.enrollment,
      expectedRowVersion: firstVersion,
      score: 44,
      attendanceStatus: "PRESENT",
      teacherRemark: null,
    };
    const r = await teacher.rpc("save_mark_entries", {
      target_mark_sheet_id: markSheetId,
      entries: [cell, cell],
    });
    expect(r.error?.message).toContain("BATCH_DUPLICATE_CELL");
  });
  it("an invalid cell rolls back every batch cell", async () => {
    const r = await teacher.rpc("save_mark_entries", {
      target_mark_sheet_id: markSheetId,
      entries: [
        {
          assessmentComponentId: ids.componentA,
          enrollmentId: ids.enrollment,
          expectedRowVersion: firstVersion,
          score: 45,
          attendanceStatus: "PRESENT",
          teacherRemark: null,
        },
        {
          assessmentComponentId: ids.componentB,
          enrollmentId: ids.otherEnrollment,
          expectedRowVersion: null,
          score: 2,
          attendanceStatus: "PRESENT",
          teacherRemark: null,
        },
      ],
    });
    expect(r.error).not.toBeNull();
    const check = await database.query(
      "select score,row_version from public.marks where mark_sheet_id=$1 and assessment_component_id=$2",
      [markSheetId, ids.componentA],
    );
    expect(Number(check.rows[0].score)).toBe(43);
    expect(check.rows[0].row_version).toBe(firstVersion);
  });
  it("failed mutations create no false success audit", async () => {
    const before = await database.query(
      "select count(*)::int n from public.audit_logs where entity_id=$1",
      [markSheetId],
    );
    await teacher.rpc(
      "save_mark_entry",
      entry({ expected_row_version: firstVersion - 1 }),
    );
    const after = await database.query(
      "select count(*)::int n from public.audit_logs where entity_id=$1",
      [markSheetId],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
  it("existing marks remain readable after enrollment withdrawal", async () => {
    await database.query(
      "update public.enrollments set status='WITHDRAWN',exited_on=current_date where id=$1",
      [ids.enrollment],
    );
    const r = await teacher.rpc("get_mark_entry_grid", {
      target_mark_sheet_id: markSheetId,
    });
    expect(
      (r.data![0].mark_entries as { enrollmentId: string }[]).some(
        (x) => x.enrollmentId === ids.enrollment,
      ),
    ).toBe(true);
  });
  it("existing sheet retains its scheme binding after retirement", async () => {
    await database.query(
      "update public.assessment_schemes set status='RETIRED' where id=$1",
      [ids.scheme],
    );
    const r = await teacher.rpc("get_mark_sheet", {
      target_mark_sheet_id: markSheetId,
    });
    expect(r.error).toBeNull();
    const check = await database.query(
      "select assessment_scheme_id from public.mark_sheets where id=$1",
      [markSheetId],
    );
    expect(check.rows[0].assessment_scheme_id).toBe(ids.scheme);
  });
  it("the read contracts do not expose guardian contacts", async () => {
    const r = await teacher.rpc("get_mark_entry_grid", {
      target_mark_sheet_id: markSheetId,
    });
    expect(JSON.stringify(r.data)).not.toMatch(/guardian|phone|email/i);
  });
});
