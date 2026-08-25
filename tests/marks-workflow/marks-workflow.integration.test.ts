import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/types/database.generated";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL!;
const password = "synthetic-stage-ten-password";
const nonce = Date.now();
type TypedClient = SupabaseClient<Database>;
type Role = Database["public"]["Enums"]["staff_role"];

const ids = Object.fromEntries(
  [
    "school",
    "otherSchool",
    "year",
    "term",
    "grade",
    "class",
    "subject",
    "scheme",
    "componentA",
    "componentB",
    "student",
    "enrollment",
    "assignment",
  ].map((key) => [key, randomUUID()]),
) as Record<string, string>;

const db = new Client({ connectionString: databaseUrl });
const admin = createClient<Database>(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});
const people = new Map<
  string,
  { email: string; membershipId: string; userId: string }
>();
let teacher: TypedClient;
let reviewer: TypedClient;
let approver: TypedClient;
let outsider: TypedClient;
let impostor: TypedClient;
let sheetId = "";
let correctionId = "";

async function addPerson(key: string, roles: Role[], schoolId = ids.school) {
  const email = `workflow.${key}.${nonce}@example.invalid`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const membershipId = randomUUID();
  await db.query(
    "insert into public.profiles(id,first_name,last_name) values($1,$2,'Synthetic')",
    [created.data.user.id, key],
  );
  await db.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status,joined_at) values($1,$2,$3,$4,'ACTIVE',current_date-90)",
    [membershipId, schoolId, created.data.user.id, `WF-${key}-${nonce}`],
  );
  for (const role of roles)
    await db.query(
      "insert into public.staff_role_assignments(id,membership_id,role,granted_at) values($1,$2,$3,now()-interval '1 day')",
      [randomUUID(), membershipId, role],
    );
  people.set(key, { email, membershipId, userId: created.data.user.id });
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

async function sheetUpdatedAt(id = sheetId) {
  const result = await db.query<{ updated_at: string }>(
    "select updated_at::text from public.mark_sheets where id=$1",
    [id],
  );
  return result.rows[0].updated_at;
}

async function termUpdatedAt() {
  const result = await db.query<{ updated_at: string }>(
    "select updated_at::text from public.terms where id=$1",
    [ids.term],
  );
  return result.rows[0].updated_at;
}

async function waitForBlocked(queryFragment: string, minimum = 1) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await db.query<{ blocked: number }>(
      "select count(*)::int blocked from pg_stat_activity where wait_event_type='Lock' and query ilike '%' || $1 || '%'",
      [queryFragment],
    );
    if (result.rows[0].blocked >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${queryFragment} to block.`);
}

async function lockSheet(targetSheetId = sheetId) {
  const control = new Client({ connectionString: databaseUrl });
  await control.connect();
  await control.query("begin");
  await control.query(
    "select id from public.mark_sheets where id=$1 for update",
    [targetSheetId],
  );
  return control;
}

async function resetSheetToDraft() {
  await db.query("begin");
  try {
    await db.query(
      "select set_config('app.marks_workflow_transition','allowed',true)",
    );
    await db.query(
      "update public.mark_sheets set workflow_status='DRAFT',submitted_by=null,submitted_at=null,reviewed_by=null,reviewed_at=null,returned_by=null,returned_at=null,return_reason=null,approved_by=null,approved_at=null,locked_by=null,locked_at=null where id=$1",
      [sheetId],
    );
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

async function resetSheetToSubmitted() {
  await db.query("begin");
  try {
    await db.query(
      "select set_config('app.marks_workflow_transition','allowed',true)",
    );
    await db.query(
      "update public.mark_sheets set workflow_status='SUBMITTED',submitted_by=$2,submitted_at=now(),reviewed_by=null,reviewed_at=null,returned_by=null,returned_at=null,return_reason=null,approved_by=null,approved_at=null,locked_by=null,locked_at=null where id=$1",
      [sheetId, people.get("teacher")!.membershipId],
    );
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

async function auditCount(action: string, targetSheetId = sheetId) {
  const result = await db.query<{ count: number }>(
    "select count(*)::int count from public.audit_logs where entity_id=$1 and action=$2",
    [targetSheetId, action],
  );
  return result.rows[0].count;
}

describe.sequential(
  "marks submission, approval, locking, and corrections",
  () => {
    beforeAll(async () => {
      await db.connect();
      await db.query(
        "insert into public.schools(id,name,slug,school_code) values($1,$2,$3,$4),($5,$6,$7,$8)",
        [
          ids.school,
          `Workflow School ${nonce}`,
          `workflow-${nonce}`,
          `WF-${nonce}`,
          ids.otherSchool,
          `Other Workflow School ${nonce}`,
          `other-workflow-${nonce}`,
          `OWF-${nonce}`,
        ],
      );
      const teacherMembership = await addPerson("teacher", [
        "SUBJECT_TEACHER",
        "SCHOOL_ADMIN",
      ]);
      await addPerson("reviewer", ["HEAD_TEACHER"]);
      await addPerson("approver", ["HEAD_TEACHER"]);
      await addPerson("outsider", ["HEAD_TEACHER"], ids.otherSchool);
      await addPerson("impostor", ["SUBJECT_TEACHER"]);
      await db.query(
        "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,'Workflow year',current_date-90,current_date+90,'ACTIVE')",
        [ids.year, ids.school],
      );
      await db.query(
        "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status) values($1,$2,'Workflow term',1,current_date-30,current_date+30,'MARKS_ENTRY')",
        [ids.term, ids.year],
      );
      await db.query(
        "insert into public.grade_levels(id,school_id,code,name,sort_order) values($1,$2,'W1','Workflow One',1)",
        [ids.grade, ids.school],
      );
      await db.query(
        "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code) values($1,$2,$3,'Workflow Class','WF-C')",
        [ids.class, ids.year, ids.grade],
      );
      await db.query(
        "insert into public.subjects(id,school_id,code,name,sort_order) values($1,$2,'WFS','Workflow Subject',1)",
        [ids.subject, ids.school],
      );
      await db.query(
        "insert into public.grade_level_subjects(grade_level_id,subject_id,sort_order) values($1,$2,1)",
        [ids.grade, ids.subject],
      );
      await db.query(
        "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,version,status,effective_from) values($1,$2,$3,$4,'Workflow Scheme',1,'DRAFT',current_date-30)",
        [ids.scheme, ids.term, ids.grade, ids.subject],
      );
      await db.query(
        "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values($1,$2,'Coursework','CW',50,50,1),($3,$2,'Exam','EX',100,50,2)",
        [ids.componentA, ids.scheme, ids.componentB],
      );
      await db.query(
        "update public.assessment_schemes set status='ACTIVE' where id=$1",
        [ids.scheme],
      );
      await db.query(
        "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date) values($1,$2,$3,'Workflow','Learner',current_date-90)",
        [ids.student, ids.school, `WF-ADM-${nonce}`],
      );
      await db.query(
        "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,status,enrolled_on) values($1,$2,$3,$4,'ACTIVE',current_date-30)",
        [ids.enrollment, ids.student, ids.year, ids.class],
      );
      await db.query(
        "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,current_date-30)",
        [ids.assignment, ids.term, ids.class, ids.subject, teacherMembership],
      );
      [teacher, reviewer, approver, outsider, impostor] = await Promise.all([
        signIn("teacher"),
        signIn("reviewer"),
        signIn("approver"),
        signIn("outsider"),
        signIn("impostor"),
      ]);
    });

    afterAll(async () => {
      await db.end();
    });

    it("enforces authoritative completeness, exact teacher authority, and selected-school isolation", async () => {
      const opened = await teacher.rpc("get_or_create_draft_mark_sheet", {
        target_teaching_assignment_id: ids.assignment,
      });
      expect(opened.error).toBeNull();
      sheetId = opened.data![0].mark_sheet_id;
      const incomplete = await teacher.rpc("submit_mark_sheet", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await sheetUpdatedAt(),
      });
      expect(incomplete.error?.message).toContain("MARK_SHEET_INCOMPLETE");
      const wrongSchool = await outsider.rpc("get_mark_sheet_workflow_detail", {
        target_mark_sheet_id: sheetId,
      });
      expect(wrongSchool.data).toEqual([]);
      const wrongSchoolMutation = await outsider.rpc("submit_mark_sheet", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await sheetUpdatedAt(),
      });
      expect(wrongSchoolMutation.error).not.toBeNull();
      const wrongTeacher = await impostor.rpc("submit_mark_sheet", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await sheetUpdatedAt(),
      });
      expect(wrongTeacher.error).not.toBeNull();
      const saved = await teacher.rpc("save_mark_entries", {
        target_mark_sheet_id: sheetId,
        entries: [
          {
            assessmentComponentId: ids.componentA,
            enrollmentId: ids.enrollment,
            expectedRowVersion: null,
            score: 44,
            attendanceStatus: "PRESENT",
            teacherRemark: null,
          },
          {
            assessmentComponentId: ids.componentB,
            enrollmentId: ids.enrollment,
            expectedRowVersion: null,
            score: 82,
            attendanceStatus: "PRESENT",
            teacherRemark: null,
          },
        ],
      });
      expect(saved.error).toBeNull();
      await db.query(
        "update public.staff_role_assignments set revoked_at=now() where membership_id=$1 and role='SUBJECT_TEACHER'",
        [people.get("teacher")!.membershipId],
      );
      const revoked = await teacher.rpc("submit_mark_sheet", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await sheetUpdatedAt(),
      });
      expect(revoked.error).not.toBeNull();
      await db.query(
        "update public.staff_role_assignments set revoked_at=null where membership_id=$1 and role='SUBJECT_TEACHER'",
        [people.get("teacher")!.membershipId],
      );
    });

    it("returns no workflow detail through another selected school", async () => {
      const result = await outsider.rpc("get_mark_sheet_workflow_detail", {
        target_mark_sheet_id: sheetId,
      });
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    });

    it("rejects a different subject teacher bound to no assignment", async () => {
      const result = await impostor.rpc("submit_mark_sheet", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await sheetUpdatedAt(),
      });
      expect(result.error).not.toBeNull();
      expect(await auditCount("MARK_SHEET_SUBMITTED")).toBe(0);
    });

    it("rejects a stale submission without writing a success audit", async () => {
      const result = await teacher.rpc("submit_mark_sheet", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: new Date(0).toISOString(),
      });
      expect(result.error?.code).toBe("PT409");
      expect(await auditCount("MARK_SHEET_SUBMITTED")).toBe(0);
    });

    it("revalidates a role revocation that commits before submission", async () => {
      const control = new Client({ connectionString: databaseUrl });
      await control.connect();
      await control.query("begin");
      try {
        await control.query(
          "update public.staff_role_assignments set revoked_at=now() where membership_id=$1 and role='SUBJECT_TEACHER'",
          [people.get("teacher")!.membershipId],
        );
        const transition = Promise.resolve(
          teacher.rpc("submit_mark_sheet", {
            target_mark_sheet_id: sheetId,
            expected_updated_at: await sheetUpdatedAt(),
          }),
        );
        await waitForBlocked("submit_mark_sheet");
        await control.query("commit");
        expect((await transition).error).not.toBeNull();
      } finally {
        await control.query("rollback").catch(() => undefined);
        await control.end();
      }
      await db.query(
        "update public.staff_role_assignments set revoked_at=null where membership_id=$1 and role='SUBJECT_TEACHER'",
        [people.get("teacher")!.membershipId],
      );
      expect(await auditCount("MARK_SHEET_SUBMITTED")).toBe(0);
    });

    it("revalidates membership suspension that commits before submission", async () => {
      const control = new Client({ connectionString: databaseUrl });
      await control.connect();
      await control.query("begin");
      try {
        await control.query(
          "update public.school_staff_memberships set status='SUSPENDED' where id=$1",
          [people.get("teacher")!.membershipId],
        );
        const transition = Promise.resolve(
          teacher.rpc("submit_mark_sheet", {
            target_mark_sheet_id: sheetId,
            expected_updated_at: await sheetUpdatedAt(),
          }),
        );
        await waitForBlocked("submit_mark_sheet");
        await control.query("commit");
        expect((await transition).error).not.toBeNull();
      } finally {
        await control.query("rollback").catch(() => undefined);
        await control.end();
      }
      await db.query(
        "update public.school_staff_memberships set status='ACTIVE' where id=$1",
        [people.get("teacher")!.membershipId],
      );
      expect(await auditCount("MARK_SHEET_SUBMITTED")).toBe(0);
    });

    it("fails roster mutation fast when marks workflow already holds the term", async () => {
      const blocker = new Client({ connectionString: databaseUrl });
      await blocker.connect();
      await blocker.query("begin");
      try {
        await blocker.query(
          "select id from public.terms where id=$1 for update",
          [ids.term],
        );
        const enrollment = await db.query<{ updated_at: string }>(
          "select updated_at::text from public.enrollments where id=$1",
          [ids.enrollment],
        );
        const result = await teacher.rpc("change_enrollment_status", {
          target_enrollment_id: ids.enrollment,
          expected_updated_at: enrollment.rows[0].updated_at,
          target_status: "WITHDRAWN",
          exited_on: new Date().toISOString().slice(0, 10),
          reason: "Concurrent roster change",
        });
        expect(result.error?.code).toBe("PT409");
        expect(result.error?.message).toContain(
          "ENROLLMENT_MARKS_WORKFLOW_CONFLICT",
        );
      } finally {
        await blocker.query("rollback");
        await blocker.end();
      }
    });

    it("serializes submit before save so the queued save fails closed", async () => {
      const blocker = await lockSheet();
      let released = false;
      try {
        const timestamp = await sheetUpdatedAt();
        const submit = Promise.resolve(
          teacher.rpc("submit_mark_sheet", {
            target_mark_sheet_id: sheetId,
            expected_updated_at: timestamp,
          }),
        );
        await waitForBlocked("submit_mark_sheet");
        const save = Promise.resolve(
          teacher.rpc("save_mark_entry", {
            target_mark_sheet_id: sheetId,
            target_assessment_component_id: ids.componentA,
            target_enrollment_id: ids.enrollment,
            expected_row_version: 1,
            entered_score: 41,
            entered_attendance_status: "PRESENT",
            entered_teacher_remark: null as unknown as string,
          }),
        );
        await waitForBlocked("save_mark_entry");
        await blocker.query("commit");
        released = true;
        expect((await submit).error).toBeNull();
        expect((await save).error).not.toBeNull();
      } finally {
        if (!released) await blocker.query("rollback");
        await blocker.end();
      }
      await resetSheetToDraft();
    });

    it("allows exactly one contender in a true double-submit race", async () => {
      const blocker = await lockSheet();
      let released = false;
      try {
        const timestamp = await sheetUpdatedAt();
        const first = Promise.resolve(
          teacher.rpc("submit_mark_sheet", {
            target_mark_sheet_id: sheetId,
            expected_updated_at: timestamp,
          }),
        );
        await waitForBlocked("submit_mark_sheet");
        const second = Promise.resolve(
          teacher.rpc("submit_mark_sheet", {
            target_mark_sheet_id: sheetId,
            expected_updated_at: timestamp,
          }),
        );
        await waitForBlocked("submit_mark_sheet", 2);
        await blocker.query("commit");
        released = true;
        const results = await Promise.all([first, second]);
        expect(results.filter((result) => result.error === null)).toHaveLength(
          1,
        );
      } finally {
        if (!released) await blocker.query("rollback");
        await blocker.end();
      }
      await resetSheetToDraft();
    });

    it("serializes save before submit and submits the completed saved state", async () => {
      const locked = await lockSheet();
      let released = false;
      try {
        const save = Promise.resolve(
          teacher.rpc("save_mark_entry", {
            target_mark_sheet_id: sheetId,
            target_assessment_component_id: ids.componentA,
            target_enrollment_id: ids.enrollment,
            expected_row_version: 1,
            entered_score: 45,
            entered_attendance_status: "PRESENT",
            entered_teacher_remark: null as unknown as string,
          }),
        );
        await waitForBlocked("save_mark_entry");
        const timestamp = await sheetUpdatedAt();
        const firstSubmit = Promise.resolve(
          teacher.rpc("submit_mark_sheet", {
            target_mark_sheet_id: sheetId,
            expected_updated_at: timestamp,
          }),
        );
        await waitForBlocked("submit_mark_sheet");
        await locked.query("commit");
        released = true;
        expect((await save).error).toBeNull();
        expect((await firstSubmit).error).toBeNull();
      } finally {
        if (!released) await locked.query("rollback");
        await locked.end();
      }
      const frozen = await teacher.rpc("save_mark_entry", {
        target_mark_sheet_id: sheetId,
        target_assessment_component_id: ids.componentA,
        target_enrollment_id: ids.enrollment,
        expected_row_version: 2,
        entered_score: 46,
        entered_attendance_status: "PRESENT",
        entered_teacher_remark: null as unknown as string,
      });
      expect(frozen.error).not.toBeNull();
    });

    it("allows exactly one winner in a return-versus-approve race", async () => {
      expect(
        (
          await reviewer.rpc("start_mark_sheet_review", {
            target_mark_sheet_id: sheetId,
            expected_updated_at: await sheetUpdatedAt(),
          })
        ).error,
      ).toBeNull();
      const returnAudits = await auditCount("MARK_SHEET_RETURNED");
      const approvalAudits = await auditCount("MARK_SHEET_APPROVED");
      const blocker = await lockSheet();
      let released = false;
      try {
        const timestamp = await sheetUpdatedAt();
        const returned = Promise.resolve(
          reviewer.rpc("return_mark_sheet", {
            target_mark_sheet_id: sheetId,
            expected_updated_at: timestamp,
            return_reason: "Concurrent return wins or fails closed",
          }),
        );
        await waitForBlocked("return_mark_sheet");
        const approved = Promise.resolve(
          approver.rpc("approve_mark_sheet", {
            target_mark_sheet_id: sheetId,
            expected_updated_at: timestamp,
          }),
        );
        await waitForBlocked("approve_mark_sheet");
        await blocker.query("commit");
        released = true;
        const results = await Promise.all([returned, approved]);
        expect(results.filter((result) => result.error === null)).toHaveLength(
          1,
        );
      } finally {
        if (!released) await blocker.query("rollback");
        await blocker.end();
      }
      const final = await db.query<{ workflow_status: string }>(
        "select workflow_status from public.mark_sheets where id=$1",
        [sheetId],
      );
      expect(["RETURNED", "APPROVED"]).toContain(final.rows[0].workflow_status);
      expect(
        (await auditCount("MARK_SHEET_RETURNED")) -
          returnAudits +
          ((await auditCount("MARK_SHEET_APPROVED")) - approvalAudits),
      ).toBe(1);
      await resetSheetToSubmitted();
    });

    it("rejects invalid return reasons without a success audit", async () => {
      expect(
        (
          await reviewer.rpc("start_mark_sheet_review", {
            target_mark_sheet_id: sheetId,
            expected_updated_at: await sheetUpdatedAt(),
          })
        ).error,
      ).toBeNull();
      const before = await auditCount("MARK_SHEET_RETURNED");
      const result = await reviewer.rpc("return_mark_sheet", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await sheetUpdatedAt(),
        return_reason: "   ",
      });
      expect(result.error?.message).toContain("MARKS_WORKFLOW_REASON_REQUIRED");
      expect(await auditCount("MARK_SHEET_RETURNED")).toBe(before);
      await resetSheetToSubmitted();
    });

    it("re-evaluates term readiness after a queued sheet becomes blocking", async () => {
      expect(
        (
          await reviewer.rpc("start_mark_sheet_review", {
            target_mark_sheet_id: sheetId,
            expected_updated_at: await sheetUpdatedAt(),
          })
        ).error,
      ).toBeNull();
      const blocker = new Client({ connectionString: databaseUrl });
      await blocker.connect();
      await blocker.query("begin");
      let released = false;
      try {
        await blocker.query(
          "select id from public.teaching_assignments where id=$1 for update",
          [ids.assignment],
        );
        const returned = Promise.resolve(
          reviewer.rpc("return_mark_sheet", {
            target_mark_sheet_id: sheetId,
            expected_updated_at: await sheetUpdatedAt(),
            return_reason: "Readiness race fixture",
          }),
        );
        await waitForBlocked("return_mark_sheet");
        const advance = Promise.resolve(
          reviewer.rpc("advance_term_marks_to_review", {
            target_term_id: ids.term,
            expected_updated_at: await termUpdatedAt(),
          }),
        );
        await waitForBlocked("advance_term_marks_to_review");
        await blocker.query("commit");
        released = true;
        expect((await returned).error).toBeNull();
        expect((await advance).error?.message).toContain(
          "TERM_MARKS_NOT_READY_FOR_REVIEW",
        );
      } finally {
        if (!released) await blocker.query("rollback");
        await blocker.end();
      }
      expect(
        (
          await db.query("select status from public.terms where id=$1", [
            ids.term,
          ])
        ).rows[0].status,
      ).toBe("MARKS_ENTRY");
      await resetSheetToSubmitted();
    });

    it("enforces separation of duties and supports return, correction, and resubmission", async () => {
      const selfReview = await teacher.rpc("start_mark_sheet_review", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await sheetUpdatedAt(),
      });
      expect(selfReview.error?.message).toContain(
        "MARK_SHEET_SELF_REVIEW_FORBIDDEN",
      );
      const started = await reviewer.rpc("start_mark_sheet_review", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await sheetUpdatedAt(),
      });
      expect(started.error).toBeNull();

      const selfReturn = await teacher.rpc("return_mark_sheet", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await sheetUpdatedAt(),
        return_reason: "Submitter cannot return their own work",
      });
      expect(selfReturn.error?.message).toContain(
        "MARK_SHEET_SELF_REVIEW_FORBIDDEN",
      );

      const selfApprove = await teacher.rpc("approve_mark_sheet", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await sheetUpdatedAt(),
      });
      expect(selfApprove.error?.message).toContain(
        "MARK_SHEET_SELF_REVIEW_FORBIDDEN",
      );

      const returned = await reviewer.rpc("return_mark_sheet", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await sheetUpdatedAt(),
        return_reason: "  Verify coursework source  ",
      });
      expect(returned.error).toBeNull();
      const corrected = await teacher.rpc("save_mark_entry", {
        target_mark_sheet_id: sheetId,
        target_assessment_component_id: ids.componentA,
        target_enrollment_id: ids.enrollment,
        expected_row_version: 2,
        entered_score: 46,
        entered_attendance_status: "PRESENT",
        entered_teacher_remark: "Checked",
      });
      expect(corrected.error).toBeNull();
      const resubmitted = await teacher.rpc("resubmit_returned_mark_sheet", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await sheetUpdatedAt(),
      });
      expect(resubmitted.error).toBeNull();
    });

    it("serializes competing reviewers and completes approval and term locking", async () => {
      const locked = await lockSheet();
      let released = false;
      try {
        const timestamp = await sheetUpdatedAt();
        const first = Promise.resolve(
          reviewer.rpc("start_mark_sheet_review", {
            target_mark_sheet_id: sheetId,
            expected_updated_at: timestamp,
          }),
        );
        await waitForBlocked("start_mark_sheet_review");
        const second = Promise.resolve(
          approver.rpc("start_mark_sheet_review", {
            target_mark_sheet_id: sheetId,
            expected_updated_at: timestamp,
          }),
        );
        await waitForBlocked("start_mark_sheet_review", 2);
        await locked.query("commit");
        released = true;
        const results = await Promise.all([first, second]);
        expect(results.filter((result) => result.error === null)).toHaveLength(
          1,
        );
      } finally {
        if (!released) await locked.query("rollback");
        await locked.end();
      }
      const approved = await reviewer.rpc("approve_mark_sheet", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await sheetUpdatedAt(),
      });
      expect(approved.error).toBeNull();
      const review = await reviewer.rpc("advance_term_marks_to_review", {
        target_term_id: ids.term,
        expected_updated_at: await termUpdatedAt(),
      });
      expect(review.error).toBeNull();
      const sheetLocked = await reviewer.rpc("lock_mark_sheet", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await sheetUpdatedAt(),
      });
      expect(sheetLocked.error).toBeNull();
      const termLocked = await reviewer.rpc("lock_term_marks", {
        target_term_id: ids.term,
        expected_updated_at: await termUpdatedAt(),
      });
      expect(termLocked.error).toBeNull();
    });

    it("creates a separate cloned correction revision and relocks the latest revision", async () => {
      const reopened = await reviewer.rpc(
        "reopen_locked_term_for_mark_correction",
        {
          target_term_id: ids.term,
          expected_updated_at: await termUpdatedAt(),
          correction_reason: "Verified correction request",
        },
      );
      expect(reopened.error).toBeNull();
      await db.query(
        "update public.assessment_schemes set status='RETIRED' where id=$1",
        [ids.scheme],
      );
      const sourceBefore = await db.query(
        "select id,assessment_component_id,enrollment_id,score::text,attendance_status,teacher_remark,row_version,created_by,updated_by,created_at::text,updated_at::text from public.marks where mark_sheet_id=$1 order by assessment_component_id",
        [sheetId],
      );
      const blocker = await lockSheet();
      let released = false;
      try {
        const timestamp = await sheetUpdatedAt();
        const first = Promise.resolve(
          reviewer.rpc("create_mark_sheet_correction_revision", {
            source_mark_sheet_id: sheetId,
            expected_source_updated_at: timestamp,
            correction_reason: "Correct source transcription",
          }),
        );
        await waitForBlocked("create_mark_sheet_correction_revision");
        const second = Promise.resolve(
          approver.rpc("create_mark_sheet_correction_revision", {
            source_mark_sheet_id: sheetId,
            expected_source_updated_at: timestamp,
            correction_reason: "Competing correction request",
          }),
        );
        await waitForBlocked("create_mark_sheet_correction_revision", 2);
        await blocker.query("commit");
        released = true;
        const results = await Promise.all([first, second]);
        expect(results.filter((result) => result.error === null)).toHaveLength(
          1,
        );
        const created = results.find((result) => result.error === null)!;
        correctionId = created.data![0].correction_sheet_id;
        expect(correctionId).not.toBe(sheetId);
        expect(created.data![0].correction_version).toBe(2);
      } finally {
        if (!released) await blocker.query("rollback");
        await blocker.end();
      }
      const cloned = await db.query(
        "select assessment_component_id,enrollment_id,score::text,attendance_status,teacher_remark from public.marks where mark_sheet_id=$1 order by assessment_component_id",
        [correctionId],
      );
      expect(cloned.rows).toEqual(
        sourceBefore.rows.map(
          ({
            assessment_component_id,
            enrollment_id,
            score,
            attendance_status,
            teacher_remark,
          }) => ({
            assessment_component_id,
            enrollment_id,
            score,
            attendance_status,
            teacher_remark,
          }),
        ),
      );
      const grid = await teacher.rpc("get_mark_entry_grid", {
        target_mark_sheet_id: correctionId,
      });
      const firstCell = (
        grid.data![0].mark_entries as {
          componentId: string;
          rowVersion: number;
        }[]
      ).find((cell) => cell.componentId === ids.componentA)!;
      const edited = await teacher.rpc("save_mark_entry", {
        target_mark_sheet_id: correctionId,
        target_assessment_component_id: ids.componentA,
        target_enrollment_id: ids.enrollment,
        expected_row_version: firstCell.rowVersion,
        entered_score: 47,
        entered_attendance_status: "PRESENT",
        entered_teacher_remark: "Corrected revision",
      });
      expect(edited.error).toBeNull();
      const submitted = await teacher.rpc("submit_mark_sheet", {
        target_mark_sheet_id: correctionId,
        expected_updated_at: await sheetUpdatedAt(correctionId),
      });
      expect(submitted.error).toBeNull();
      expect(
        (
          await reviewer.rpc("start_mark_sheet_review", {
            target_mark_sheet_id: correctionId,
            expected_updated_at: await sheetUpdatedAt(correctionId),
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await reviewer.rpc("approve_mark_sheet", {
            target_mark_sheet_id: correctionId,
            expected_updated_at: await sheetUpdatedAt(correctionId),
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await reviewer.rpc("lock_mark_sheet", {
            target_mark_sheet_id: correctionId,
            expected_updated_at: await sheetUpdatedAt(correctionId),
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await reviewer.rpc("lock_term_marks", {
            target_term_id: ids.term,
            expected_updated_at: await termUpdatedAt(),
          })
        ).error,
      ).toBeNull();
      const enrollmentTimestamp = await db.query<{ updated_at: string }>(
        "select updated_at::text from public.enrollments where id=$1",
        [ids.enrollment],
      );
      const postLockRosterChange = await teacher.rpc(
        "change_enrollment_status",
        {
          target_enrollment_id: ids.enrollment,
          expected_updated_at: enrollmentTimestamp.rows[0].updated_at,
          target_status: "WITHDRAWN",
          exited_on: new Date().toISOString().slice(0, 10),
          reason: "Attempt to alter locked roster",
        },
      );
      expect(postLockRosterChange.error?.message).toContain(
        "ENROLLMENT_MARKS_WORKFLOW_FROZEN",
      );
      const enrollmentMetadata = await db.query<{
        enrolled_on: string;
        updated_at: string;
      }>(
        "select enrolled_on::text,updated_at::text from public.enrollments where id=$1",
        [ids.enrollment],
      );
      const nonRosterChange = await teacher.rpc("update_student_enrollment", {
        target_enrollment_id: ids.enrollment,
        expected_updated_at: enrollmentMetadata.rows[0].updated_at,
        enrolled_on: enrollmentMetadata.rows[0].enrolled_on,
        class_number: "LOCKED-METADATA-OK",
      });
      expect(nonRosterChange.error).toBeNull();
      const sourceAfter = await db.query(
        "select id,assessment_component_id,enrollment_id,score::text,attendance_status,teacher_remark,row_version,created_by,updated_by,created_at::text,updated_at::text from public.marks where mark_sheet_id=$1 order by assessment_component_id",
        [sheetId],
      );
      expect(sourceAfter.rows).toEqual(sourceBefore.rows);
      const audits = await db.query<{ count: number }>(
        "select count(*)::int count from public.audit_logs where school_id=$1 and action in ('MARK_SHEET_SUBMITTED','MARK_SHEET_REVIEW_STARTED','MARK_SHEET_RETURNED','MARK_SHEET_RESUBMITTED','MARK_SHEET_APPROVED','MARK_SHEET_LOCKED','MARK_SHEET_CORRECTION_REVISION_CREATED','TERM_MARKS_REVIEW_STARTED','TERM_MARKS_LOCKED','TERM_MARKS_REOPENED_FOR_CORRECTION')",
        [ids.school],
      );
      expect(audits.rows[0].count).toBeGreaterThanOrEqual(12);
    });

    it("keeps correction lineage singular and the retired source immutable", async () => {
      const lineage = await db.query<{
        assessment_scheme_id: string;
        source_status: string;
        source_version: number;
        successor_count: number;
        successor_version: number;
      }>(
        "select source.workflow_status source_status,source.version source_version,successor.version successor_version,successor.assessment_scheme_id,(select count(*)::int from public.mark_sheets child where child.supersedes_mark_sheet_id=source.id) successor_count from public.mark_sheets source join public.mark_sheets successor on successor.supersedes_mark_sheet_id=source.id where source.id=$1",
        [sheetId],
      );
      expect(lineage.rows[0]).toMatchObject({
        assessment_scheme_id: ids.scheme,
        source_status: "LOCKED",
        source_version: 1,
        successor_count: 1,
        successor_version: 2,
      });
      expect(
        (
          await db.query(
            "select status from public.assessment_schemes where id=$1",
            [ids.scheme],
          )
        ).rows[0].status,
      ).toBe("RETIRED");
    });

    it("keeps every submitter-side review capability disabled after relock", async () => {
      const detail = await teacher.rpc("get_mark_sheet_workflow_detail", {
        target_mark_sheet_id: correctionId,
      });
      expect(detail.error).toBeNull();
      expect(detail.data?.[0]).toMatchObject({
        actor_is_submitter: true,
        can_start_review: false,
        can_return: false,
        can_approve: false,
        can_lock: false,
      });
    });

    it("rejects controlled reopen after a downstream report batch appears", async () => {
      const batchId = randomUUID();
      await db.query(
        "insert into public.report_batches(id,term_id,class_section_id,requested_by) values($1,$2,$3,$4)",
        [batchId, ids.term, ids.class, people.get("reviewer")!.membershipId],
      );
      const before = await db.query<{ count: number }>(
        "select count(*)::int count from public.audit_logs where entity_id=$1 and action='TERM_MARKS_REOPENED_FOR_CORRECTION'",
        [ids.term],
      );
      const result = await reviewer.rpc(
        "reopen_locked_term_for_mark_correction",
        {
          target_term_id: ids.term,
          expected_updated_at: await termUpdatedAt(),
          correction_reason: "Must fail after downstream report work",
        },
      );
      expect(result.error?.message).toContain(
        "TERM_MARKS_CORRECTION_DOWNSTREAM_DEPENDENCY",
      );
      const after = await db.query<{ count: number }>(
        "select count(*)::int count from public.audit_logs where entity_id=$1 and action='TERM_MARKS_REOPENED_FOR_CORRECTION'",
        [ids.term],
      );
      expect(after.rows[0].count).toBe(before.rows[0].count);
    });

    it("records one correction creation audit and no duplicate successor", async () => {
      expect(
        await auditCount(
          "MARK_SHEET_CORRECTION_REVISION_CREATED",
          correctionId,
        ),
      ).toBe(1);
      const children = await db.query<{ count: number }>(
        "select count(*)::int count from public.mark_sheets where supersedes_mark_sheet_id=$1",
        [sheetId],
      );
      expect(children.rows[0].count).toBe(1);
    });
  },
);
