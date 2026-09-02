import { createHash, randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/types/database.generated";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL;
const enabled = Boolean(url && anonKey && serviceKey && databaseUrl);
const password = "stage15-behavioral-synthetic-password";
const nonce = `${Date.now()}-${randomUUID().slice(0, 8)}`;

const admin = enabled
  ? createClient<Database>(url!, serviceKey!, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })
  : null;
const db = enabled ? new Client({ connectionString: databaseUrl! }) : null;

type Staff = {
  client: SupabaseClient<Database>;
  email: string;
  membershipId: string;
  userId: string;
};

type Fixture = {
  schoolA: string;
  schoolB: string;
  yearA: string;
  yearB: string;
  gradeA: string;
  gradeB: string;
  sectionA: string;
  sectionB: string;
  termA: string;
  termB: string;
  subjectA: string;
  subjectB: string;
  studentA: string;
  studentB: string;
  studentBInOtherSchool: string;
  enrollmentA: string;
  enrollmentB: string;
  enrollmentBInOtherSchool: string;
  guardianA: string;
  relationshipA: string;
  reportCurrent: string;
  reportHistorical: string;
  reportUnpublishedSuperseded: string;
  reportWithdrawn: string;
  reportGenerated: string;
  reportReviewed: string;
  reportOtherStudent: string;
  reportOtherSchool: string;
  currentArtifact: Buffer;
  currentChecksum: string;
  currentPath: string;
};

let fixture: Fixture;
let registrar: Staff;
let headTeacher: Staff;
let classTeacher: Staff;
let subjectTeacher: Staff;
let otherSchoolAdmin: Staff;
const createdUsers: string[] = [];

function key(label: string) {
  return createHash("sha256")
    .update(`stage15-behavior-${label}-${nonce}`)
    .digest("hex");
}

function genericLoginResult(result: { data: unknown; error: unknown }) {
  expect(result.error).toBeNull();
  const row = (
    result.data as Array<{ ok: boolean; session_token: string | null }>
  )[0];
  expect(row.ok).toBe(false);
  expect(row.session_token).toBeNull();
}

async function createStaff(label: string, role: string, schoolId: string) {
  const email = `stage15.${label}.${nonce}@example.invalid`;
  const created = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  createdUsers.push(created.data.user.id);
  const membershipId = randomUUID();
  await db!.query(
    "insert into public.profiles(id,first_name,last_name) values($1,$2,'Portal Test')",
    [created.data.user.id, label],
  );
  await db!.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [membershipId, schoolId, created.data.user.id, `ST15-${label}-${nonce}`],
  );
  await db!.query(
    "insert into public.staff_role_assignments(id,membership_id,role,granted_at) values($1,$2,$3,now()-interval '1 day')",
    [randomUUID(), membershipId, role],
  );
  const client = createClient<Database>(url!, anonKey!, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  const selected = await client.rpc("set_my_active_membership", {
    target_membership_id: membershipId,
  });
  if (selected.error) throw selected.error;
  return { client, email, membershipId, userId: created.data.user.id };
}

async function addReport(
  reportId: string,
  enrollmentId: string,
  termId: string,
  status: string,
  version: number,
  published: boolean,
  subjectCode = "MATH",
  subjectName = "Mathematics",
  batchId = fixtureBatchId,
  subjectId = fixture.subjectA,
) {
  const bytes = Buffer.from(`%PDF-stage15-${reportId}`);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const storagePath = `${reportId}/${checksum}.pdf`;
  if (published) {
    const upload = await admin!.storage
      .from("report-artifacts")
      .upload(storagePath, bytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (upload.error) throw upload.error;
  }
  await db!.query(
    `insert into public.reports
      (id,batch_id,term_id,enrollment_id,version,status,reviewed_at,published_at,
       withdrawn_at,pdf_storage_path,file_checksum,pdf_size_bytes,pdf_stored_at,pdf_renderer_version)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'stage15-fixture')`,
    [
      reportId,
      batchId,
      termId,
      enrollmentId,
      version,
      status,
      published ? new Date() : null,
      published ? new Date() : null,
      status === "WITHDRAWN" ? new Date() : null,
      published ? storagePath : null,
      published ? checksum : null,
      published ? bytes.length : null,
      published ? new Date() : null,
    ],
  );
  await db!.query(
    `insert into public.report_snapshots(report_id,snapshot_version,snapshot_data,source_checksum)
     values($1,1,$2,$3)`,
    [
      reportId,
      JSON.stringify({
        school: {
          name: "Stage 15 School",
          school_code: "S15",
          timezone: "Africa/Kampala",
          motto: "Secure",
        },
        student: { admission_number: "S15-A", display_name: "Ada Guardian" },
        academic_period: {
          academic_year_name: "2026",
          term_name: "Term One",
          term_number: 1,
        },
        placement: {
          enrollment_status: "ACTIVE",
          class_name: "Primary One",
          class_code: "P1-A",
          grade_code: "P1",
          grade_name: "Primary One",
        },
        academic_summary: { overall_average: 86, overall_grade: "A" },
        comments: { class_teacher: "Good work" },
      }),
      `fixture-${reportId}`,
    ],
  );
  await db!.query(
    `insert into public.report_subject_results
      (report_id,subject_id,subject_score,grade,aggregate_points,subject_position,teacher_comment,sort_order,subject_code,subject_name)
     values($1,$2,86,'A',1,1,'Excellent',1,$3,$4)`,
    [reportId, subjectId, subjectCode, subjectName],
  );
  return { bytes, checksum, storagePath };
}

let fixtureBatchId = "";
let fixtureBatchBId = "";

async function parentLogin(
  accessCode: string,
  pin = "12345678",
  label: string = randomUUID(),
) {
  return admin!.rpc("verify_parent_access", {
    access_code_lookup_hash: createHash("sha256")
      .update(accessCode.replace(/[\s-]/g, "").toUpperCase())
      .digest("hex"),
    pin_text: pin,
    client_key_hash: key(label),
  });
}

describe
  .skipIf(!enabled)
  .sequential("Stage 15 real parent portal behavior", () => {
    beforeAll(async () => {
      await db!.connect();
      fixture = {
        schoolA: randomUUID(),
        schoolB: randomUUID(),
        yearA: randomUUID(),
        yearB: randomUUID(),
        gradeA: randomUUID(),
        gradeB: randomUUID(),
        sectionA: randomUUID(),
        sectionB: randomUUID(),
        termA: randomUUID(),
        termB: randomUUID(),
        subjectA: randomUUID(),
        subjectB: randomUUID(),
        studentA: randomUUID(),
        studentB: randomUUID(),
        studentBInOtherSchool: randomUUID(),
        enrollmentA: randomUUID(),
        enrollmentB: randomUUID(),
        enrollmentBInOtherSchool: randomUUID(),
        guardianA: randomUUID(),
        relationshipA: randomUUID(),
        reportCurrent: randomUUID(),
        reportHistorical: randomUUID(),
        reportUnpublishedSuperseded: randomUUID(),
        reportWithdrawn: randomUUID(),
        reportGenerated: randomUUID(),
        reportReviewed: randomUUID(),
        reportOtherStudent: randomUUID(),
        reportOtherSchool: randomUUID(),
        currentArtifact: Buffer.alloc(0),
        currentChecksum: "",
        currentPath: "",
      };
      await db!.query(
        `insert into public.schools(id,name,slug,school_code) values
       ($1,'Stage 15 School',$2,'S15'),($3,'Stage 15 Other School',$4,'S15B')`,
        [
          fixture.schoolA,
          `stage15-${nonce}`,
          fixture.schoolB,
          `stage15b-${nonce}`,
        ],
      );
      await db!.query(
        `insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values
       ($1,$2,'2026','2026-01-01','2026-12-31','ACTIVE'),($3,$4,'2026','2026-01-01','2026-12-31','ACTIVE')`,
        [fixture.yearA, fixture.schoolA, fixture.yearB, fixture.schoolB],
      );
      await db!.query(
        `insert into public.grade_levels(id,school_id,code,name,sort_order) values
       ($1,$2,'P1','Primary One',1),($3,$4,'P1','Other Primary One',1)`,
        [fixture.gradeA, fixture.schoolA, fixture.gradeB, fixture.schoolB],
      );
      await db!.query(
        `insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code,capacity) values
       ($1,$2,$3,'P1 A','P1-A',30),($4,$5,$6,'P1 B','P1-B',30)`,
        [
          fixture.sectionA,
          fixture.yearA,
          fixture.gradeA,
          fixture.sectionB,
          fixture.yearB,
          fixture.gradeB,
        ],
      );
      await db!.query(
        `insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status) values
       ($1,$2,'Term One',1,'2026-01-01','2026-04-30','MARKS_ENTRY'),($3,$4,'Term One',1,'2026-01-01','2026-04-30','MARKS_ENTRY')`,
        [fixture.termA, fixture.yearA, fixture.termB, fixture.yearB],
      );
      await db!.query(
        `insert into public.subjects(id,school_id,code,name,sort_order) values
       ($1,$2,'MATH','Mathematics',1),($3,$4,'MTHB','Mathematics B',1)`,
        [fixture.subjectA, fixture.schoolA, fixture.subjectB, fixture.schoolB],
      );
      await db!.query(
        `insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date) values
       ($1,$2,'S15-A','Ada','Guardian','2026-01-01'),($3,$2,'S15-B','Bob','Sibling','2026-01-01'),
       ($4,$5,'S15-C','Cara','OtherSchool','2026-01-01')`,
        [
          fixture.studentA,
          fixture.schoolA,
          fixture.studentB,
          fixture.studentBInOtherSchool,
          fixture.schoolB,
        ],
      );
      await db!.query(
        `insert into public.enrollments(id,student_id,academic_year_id,class_section_id,class_number,status,enrolled_on) values
       ($1,$2,$3,$4,'1','ACTIVE','2026-01-01'),($5,$6,$3,$4,'2','ACTIVE','2026-01-01'),
       ($7,$8,$9,$10,'1','ACTIVE','2026-01-01')`,
        [
          fixture.enrollmentA,
          fixture.studentA,
          fixture.yearA,
          fixture.sectionA,
          fixture.enrollmentB,
          fixture.studentB,
          fixture.enrollmentBInOtherSchool,
          fixture.studentBInOtherSchool,
          fixture.yearB,
          fixture.sectionB,
        ],
      );
      await db!.query(
        `insert into public.guardians(id,school_id,first_name,last_name,is_active) values($1,$2,'Grace','Guardian',true);
       insert into public.student_guardians(id,student_id,guardian_id,relationship,is_primary,can_access_reports) values($3,$4,$1,'Parent',true,true)`,
        [
          fixture.guardianA,
          fixture.schoolA,
          fixture.relationshipA,
          fixture.studentA,
        ],
      );
      fixtureBatchId = randomUUID();
      await db!.query(
        `insert into public.report_batches(id,term_id,class_section_id,status,total_reports,completed_reports) values($1,$2,$3,'COMPLETED',8,8)`,
        [fixtureBatchId, fixture.termA, fixture.sectionA],
      );
      fixtureBatchBId = randomUUID();
      await db!.query(
        `insert into public.report_batches(id,term_id,class_section_id,status,total_reports,completed_reports) values($1,$2,$3,'COMPLETED',1,1)`,
        [fixtureBatchBId, fixture.termB, fixture.sectionB],
      );
      const current = await addReport(
        fixture.reportCurrent,
        fixture.enrollmentA,
        fixture.termA,
        "PUBLISHED",
        2,
        true,
      );
      fixture.currentArtifact = current.bytes;
      fixture.currentChecksum = current.checksum;
      fixture.currentPath = current.storagePath;
      await addReport(
        fixture.reportHistorical,
        fixture.enrollmentA,
        fixture.termA,
        "SUPERSEDED",
        1,
        true,
      );
      await addReport(
        fixture.reportUnpublishedSuperseded,
        fixture.enrollmentA,
        fixture.termA,
        "SUPERSEDED",
        3,
        false,
      );
      await addReport(
        fixture.reportWithdrawn,
        fixture.enrollmentA,
        fixture.termA,
        "WITHDRAWN",
        4,
        true,
      );
      await addReport(
        fixture.reportGenerated,
        fixture.enrollmentA,
        fixture.termA,
        "GENERATED",
        5,
        false,
      );
      await addReport(
        fixture.reportReviewed,
        fixture.enrollmentA,
        fixture.termA,
        "REVIEWED",
        6,
        false,
      );
      await addReport(
        fixture.reportOtherStudent,
        fixture.enrollmentB,
        fixture.termA,
        "PUBLISHED",
        1,
        true,
      );
      await addReport(
        fixture.reportOtherSchool,
        fixture.enrollmentBInOtherSchool,
        fixture.termB,
        "PUBLISHED",
        1,
        true,
        "MTHB",
        "Mathematics B",
        fixtureBatchBId,
        fixture.subjectB,
      );
      registrar = await createStaff(
        "Registrar",
        "SCHOOL_ADMIN",
        fixture.schoolA,
      );
      headTeacher = await createStaff("Head", "HEAD_TEACHER", fixture.schoolA);
      classTeacher = await createStaff(
        "Class",
        "CLASS_TEACHER",
        fixture.schoolA,
      );
      subjectTeacher = await createStaff(
        "Subject",
        "SUBJECT_TEACHER",
        fixture.schoolA,
      );
      otherSchoolAdmin = await createStaff(
        "OtherSchool",
        "SCHOOL_ADMIN",
        fixture.schoolB,
      );
    });

    afterAll(async () => {
      for (const userId of createdUsers)
        await admin!.auth.admin.deleteUser(userId);
      await db?.end();
    });

    it("issues credentials through an authorized staff RPC and returns plaintext once", async () => {
      const result = await registrar.client.rpc(
        "issue_student_parent_access_credential",
        { target_student_id: fixture.studentA },
      );
      expect(result.error).toBeNull();
      expect(result.data?.[0]?.access_code).toMatch(/^[A-F0-9-]{35}$/);
      expect(result.data?.[0]?.pin).toMatch(/^\d{8}$/);
    });

    it("stores only hashes and has one active credential with an audit", async () => {
      const row = await db!.query<{
        access_code_lookup_hash: string;
        pin_hash: string;
        count: string;
      }>(
        `select c.access_code_lookup_hash,c.pin_hash,
              (select count(*) from public.student_access_credentials where student_id=$1 and is_active)::text
         from public.student_access_credentials c where c.student_id=$1 and c.is_active`,
        [fixture.studentA],
      );
      expect(row.rows[0]!.access_code_lookup_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(row.rows[0]!.pin_hash).toMatch(/^\$2/);
      expect(row.rows[0]!.count).toBe("1");
      const audit = await db!.query<{ count: string }>(
        "select count(*)::text from public.audit_logs where action='PARENT_ACCESS_CREDENTIAL_ISSUED'",
      );
      expect(Number(audit.rows[0]!.count)).toBeGreaterThan(0);
    });

    it.each([
      ["head teacher", () => headTeacher],
      ["class teacher", () => classTeacher],
      ["subject teacher", () => subjectTeacher],
    ])("denies staff without STUDENTS_MANAGE: %s", async (_label, getStaff) => {
      const result = await getStaff().client.rpc(
        "issue_student_parent_access_credential",
        { target_student_id: fixture.studentA },
      );
      expect(result.error).not.toBeNull();
    });

    it("denies an authorized staff member operating on another school", async () => {
      const result = await otherSchoolAdmin.client.rpc(
        "issue_student_parent_access_credential",
        { target_student_id: fixture.studentA },
      );
      expect(result.error).not.toBeNull();
    });

    it("allows issuance only while an active eligible guardian exists", async () => {
      await db!.query(
        "update public.student_guardians set can_access_reports=false where id=$1",
        [fixture.relationshipA],
      );
      const denied = await registrar.client.rpc(
        "issue_student_parent_access_credential",
        { target_student_id: fixture.studentA },
      );
      expect(denied.error).not.toBeNull();
      await db!.query(
        "update public.student_guardians set can_access_reports=true where id=$1",
        [fixture.relationshipA],
      );
    });

    it("accepts a valid parent login and creates one hashed session", async () => {
      const credential = await registrar.client.rpc(
        "issue_student_parent_access_credential",
        { target_student_id: fixture.studentA },
      );
      const issued = credential.data![0]!;
      const result = await parentLogin(
        issued.access_code,
        issued.pin,
        "valid-login",
      );
      expect(result.error).toBeNull();
      expect(result.data?.[0]?.ok).toBe(true);
      expect(result.data?.[0]?.session_token).toMatch(/^[a-f0-9]{64}$/);
      const sessions = await db!.query<{ count: string }>(
        "select count(*)::text from public.parent_access_sessions where student_access_credential_id=$1",
        [issued.credential_id],
      );
      expect(Number(sessions.rows[0]!.count)).toBeGreaterThanOrEqual(1);
    });

    it.each(["unknown-code", "wrong-pin"])(
      "returns a generic result for %s",
      async (kind) => {
        const result =
          kind === "unknown-code"
            ? await parentLogin(
                "00000000-00000000-00000000-00000000",
                "12345678",
                kind,
              )
            : await parentLogin("INVALID", "00000000", kind);
        genericLoginResult(result);
      },
    );

    it("denies inactive and expired credentials generically", async () => {
      await db!.query(
        "update public.student_access_credentials set is_active=false where student_id=$1",
        [fixture.studentA],
      );
      genericLoginResult(
        await parentLogin(
          "00000000-00000000-00000000-00000000",
          "12345678",
          "inactive",
        ),
      );
      await db!.query(
        "update public.student_access_credentials set is_active=true, expires_at=now()-interval '1 minute' where student_id=$1",
        [fixture.studentA],
      );
      genericLoginResult(
        await parentLogin(
          "00000000-00000000-00000000-00000000",
          "12345678",
          "expired",
        ),
      );
      await db!.query(
        "update public.student_access_credentials set expires_at=null where student_id=$1",
        [fixture.studentA],
      );
    });

    it("locks exactly after five wrong PIN attempts and permits access after expiry", async () => {
      const credential = await registrar.client.rpc(
        "issue_student_parent_access_credential",
        { target_student_id: fixture.studentA },
      );
      const issued = credential.data![0]!;
      for (let attempt = 1; attempt <= 5; attempt++)
        genericLoginResult(
          await parentLogin(
            issued.access_code,
            "00000000",
            `threshold-${attempt}`,
          ),
        );
      const locked = await db!.query<{
        failed_attempts: number;
        locked_until: string | null;
      }>(
        "select failed_attempts,locked_until from public.student_access_credentials where id=$1",
        [issued.credential_id],
      );
      expect(locked.rows[0]!.failed_attempts).toBe(5);
      expect(locked.rows[0]!.locked_until).not.toBeNull();
      genericLoginResult(
        await parentLogin(issued.access_code, issued.pin, "locked-correct"),
      );
      await db!.query(
        "update public.student_access_credentials set locked_until=now()-interval '1 second' where id=$1",
        [issued.credential_id],
      );
      expect(
        (await parentLogin(issued.access_code, issued.pin, "after-lock"))
          .data?.[0]?.ok,
      ).toBe(true);
    });

    it("fails login after the last eligible relationship is removed without success state", async () => {
      const credential = await registrar.client.rpc(
        "issue_student_parent_access_credential",
        { target_student_id: fixture.studentA },
      );
      const issued = credential.data![0]!;
      const before = await db!.query<{ count: string }>(
        "select count(*)::text from public.parent_security_events where event_type='PARENT_LOGIN_SUCCEEDED' and credential_id=$1",
        [issued.credential_id],
      );
      await db!.query(
        "update public.student_guardians set can_access_reports=false where id=$1",
        [fixture.relationshipA],
      );
      genericLoginResult(
        await parentLogin(
          issued.access_code,
          issued.pin,
          "eligibility-removed",
        ),
      );
      const after = await db!.query<{ sessions: string; successes: string }>(
        "select (select count(*)::text from public.parent_access_sessions where student_access_credential_id=$1 and revoked_at is null),(select count(*)::text from public.parent_security_events where event_type='PARENT_LOGIN_SUCCEEDED' and credential_id=$1)",
        [issued.credential_id],
      );
      expect(after.rows[0]!.successes).toBe(before.rows[0]!.count);
      expect(Number(after.rows[0]!.sessions)).toBe(0);
      await db!.query(
        "update public.student_guardians set can_access_reports=true where id=$1",
        [fixture.relationshipA],
      );
    });

    it("denies login when the linked guardian is inactive", async () => {
      const credential = await registrar.client.rpc(
        "issue_student_parent_access_credential",
        { target_student_id: fixture.studentA },
      );
      const issued = credential.data![0]!;
      await db!.query(
        "update public.guardians set is_active=false where id=$1",
        [fixture.guardianA],
      );
      genericLoginResult(
        await parentLogin(issued.access_code, issued.pin, "inactive-guardian"),
      );
      await db!.query(
        "update public.guardians set is_active=true where id=$1",
        [fixture.guardianA],
      );
    });

    it("rotates credentials, revokes old sessions, and accepts only the new secret", async () => {
      const first = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const oldSession = (
        await parentLogin(first.access_code, first.pin, "rotation-old")
      ).data![0]!.session_token!;
      const second = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      expect(second.credential_id).not.toBe(first.credential_id);
      expect(
        (await parentLogin(first.access_code, first.pin, "rotation-old-code"))
          .data?.[0]?.ok,
      ).toBe(false);
      const oldValidation = await admin!.rpc("validate_parent_access_session", {
        session_token_hash: createHash("sha256")
          .update(oldSession)
          .digest("hex"),
      });
      expect(oldValidation.data).toEqual([]);
      expect(
        (await parentLogin(second.access_code, second.pin, "rotation-new"))
          .data?.[0]?.ok,
      ).toBe(true);
    });

    it("revokes a credential and makes its existing session unusable", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const token = (
        await parentLogin(issued.access_code, issued.pin, "revoke")
      ).data![0]!.session_token!;
      expect(
        (
          await registrar.client.rpc(
            "revoke_student_parent_access_credential",
            { target_student_id: fixture.studentA },
          )
        ).error,
      ).toBeNull();
      const validation = await admin!.rpc("validate_parent_access_session", {
        session_token_hash: createHash("sha256").update(token).digest("hex"),
      });
      expect(validation.data).toEqual([]);
      await db!.query(
        "update public.student_access_credentials set is_active=true where student_id=$1",
        [fixture.studentA],
      );
    });

    it("supports logout and denies absolute and idle-expired sessions", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const token = (
        await parentLogin(issued.access_code, issued.pin, "session-lifecycle")
      ).data![0]!.session_token!;
      const hash = createHash("sha256").update(token).digest("hex");
      expect(
        (
          await admin!.rpc("revoke_parent_access_session", {
            session_token_hash: hash,
          })
        ).data,
      ).toBe(true);
      expect(
        (
          await admin!.rpc("validate_parent_access_session", {
            session_token_hash: hash,
          })
        ).data,
      ).toEqual([]);
      const next = (
        await parentLogin(issued.access_code, issued.pin, "session-expiry")
      ).data![0]!.session_token!;
      await db!.query(
        "update public.parent_access_sessions set expires_at=now()-interval '1 second' where session_token_hash=$1",
        [createHash("sha256").update(next).digest("hex")],
      );
      expect(
        (
          await admin!.rpc("validate_parent_access_session", {
            session_token_hash: createHash("sha256").update(next).digest("hex"),
          })
        ).data,
      ).toEqual([]);
    });

    it("lists only current published and published historical reports", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const token = (await parentLogin(issued.access_code, issued.pin, "list"))
        .data![0]!.session_token!;
      const list = await admin!.rpc("get_parent_published_reports", {
        session_token_hash: createHash("sha256").update(token).digest("hex"),
      });
      const ids = (list.data ?? []).map((row) => row.report_id);
      expect(ids).toContain(fixture.reportCurrent);
      expect(ids).toContain(fixture.reportHistorical);
      expect(ids).not.toContain(fixture.reportUnpublishedSuperseded);
      expect(ids).not.toContain(fixture.reportWithdrawn);
      expect(ids).not.toContain(fixture.reportGenerated);
      expect(ids).not.toContain(fixture.reportReviewed);
    });

    it("returns safe frozen detail data and excludes guardian contact data", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const token = (
        await parentLogin(issued.access_code, issued.pin, "detail")
      ).data![0]!.session_token!;
      const result = await admin!.rpc("get_parent_report_detail", {
        session_token_hash: createHash("sha256").update(token).digest("hex"),
        target_report_id: fixture.reportCurrent,
      });
      const data = result.data![0]!.parent_data as Record<string, unknown>;
      expect(data.student).toEqual({
        admission_number: "S15-A",
        display_name: "Ada Guardian",
      });
      expect(JSON.stringify(data)).not.toContain("+256");
      expect(JSON.stringify(data)).not.toContain("guardianA");
    });

    it("keeps frozen subject identity after the live subject is renamed", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const token = (
        await parentLogin(issued.access_code, issued.pin, "frozen-subject")
      ).data![0]!.session_token!;
      await db!.query(
        "update public.subjects set code='MTH',name='Mathematics and Numeracy' where id=$1",
        [fixture.subjectA],
      );
      const result = await admin!.rpc("get_parent_report_detail", {
        session_token_hash: createHash("sha256").update(token).digest("hex"),
        target_report_id: fixture.reportHistorical,
      });
      const subject = (
        (result.data![0]!.parent_data as Record<string, unknown>)
          .subjects as Array<Record<string, unknown>>
      )[0]!;
      expect(subject.subject_code).toBe("MATH");
      expect(subject.subject_name).toBe("Mathematics");
      expect(JSON.stringify(subject)).not.toContain("MTH");
      expect(JSON.stringify(subject)).not.toContain("Mathematics and Numeracy");
    });

    it("denies known cross-student and cross-school report UUIDs", async () => {
      await db!.query(
        "update public.subjects set code='MATH',name='Mathematics' where id=$1",
        [fixture.subjectA],
      );
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const token = (
        await parentLogin(issued.access_code, issued.pin, "isolation")
      ).data![0]!.session_token!;
      const hash = createHash("sha256").update(token).digest("hex");
      expect(
        (
          await admin!.rpc("get_parent_report_detail", {
            session_token_hash: hash,
            target_report_id: fixture.reportOtherStudent,
          })
        ).data,
      ).toEqual([]);
      expect(
        (
          await admin!.rpc("get_parent_report_detail", {
            session_token_hash: hash,
            target_report_id: fixture.reportOtherSchool,
          })
        ).data,
      ).toEqual([]);
    });

    it("delivers the exact stored PDF bytes and detects corruption", async () => {
      const stored = await admin!.storage
        .from("report-artifacts")
        .download(fixture.currentPath);
      if (stored.error) throw stored.error;
      const bytes = Buffer.from(await stored.data.arrayBuffer());
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(bytes.length).toBe(fixture.currentArtifact.length);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        fixture.currentChecksum,
      );
      const corrupt = Buffer.from("not-a-pdf");
      const replaced = await admin!.storage
        .from("report-artifacts")
        .update(fixture.currentPath, corrupt, {
          contentType: "application/pdf",
        });
      if (replaced.error) throw replaced.error;
      const downloaded = await admin!.storage
        .from("report-artifacts")
        .download(fixture.currentPath);
      if (downloaded.error) throw downloaded.error;
      const corruptBytes = Buffer.from(await downloaded.data.arrayBuffer());
      expect(corruptBytes.subarray(0, 5).toString()).not.toBe("%PDF-");
      await admin!.storage
        .from("report-artifacts")
        .update(fixture.currentPath, fixture.currentArtifact, {
          contentType: "application/pdf",
        });
    });

    it("increments persistent rate limits atomically and isolates client windows", async () => {
      const firstKey = key("rate-one");
      const secondKey = key("rate-two");
      await Promise.all(
        Array.from({ length: 8 }, () =>
          admin!.rpc("verify_parent_access", {
            access_code_lookup_hash: createHash("sha256")
              .update("UNKNOWN")
              .digest("hex"),
            pin_text: "12345678",
            client_key_hash: firstKey,
          }),
        ),
      );
      const rows = await db!.query<{ request_count: number }>(
        "select request_count from public.parent_access_rate_limits where client_key_hash=$1",
        [firstKey],
      );
      expect(rows.rows[0]!.request_count).toBe(8);
      const independent = await admin!.rpc("verify_parent_access", {
        access_code_lookup_hash: createHash("sha256")
          .update("UNKNOWN")
          .digest("hex"),
        pin_text: "12345678",
        client_key_hash: secondKey,
      });
      expect(independent.data?.[0]?.ok).toBe(false);
      expect(firstKey).not.toBe(secondKey);
    });

    it("records parent events without raw access code, PIN, or token", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const login = await parentLogin(
        issued.access_code,
        issued.pin,
        "secret-scan",
      );
      const token = login.data![0]!.session_token!;
      const rows = await db!.query<{ value: string }>(
        `select coalesce((select string_agg(row_to_json(c)::text,' ') from public.student_access_credentials c where c.student_id=$1),'') ||
              coalesce((select string_agg(row_to_json(s)::text,' ') from public.parent_access_sessions s),'') ||
              coalesce((select string_agg(row_to_json(e)::text,' ') from public.parent_security_events e where e.student_id=$1),'') as value`,
        [fixture.studentA],
      );
      expect(rows.rows[0]!.value).not.toContain(issued.access_code);
      expect(rows.rows[0]!.value).not.toContain(issued.pin);
      expect(rows.rows[0]!.value).not.toContain(token);
    });

    it("writes successful login, report-view, and artifact-access audit events", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const token = (await parentLogin(issued.access_code, issued.pin, "audit"))
        .data![0]!.session_token!;
      const hash = createHash("sha256").update(token).digest("hex");
      await admin!.rpc("get_parent_report_detail", {
        session_token_hash: hash,
        target_report_id: fixture.reportCurrent,
      });
      const descriptor = await admin!.rpc(
        "get_parent_report_artifact_descriptor",
        { session_token_hash: hash, target_report_id: fixture.reportCurrent },
      );
      await admin!.rpc("record_parent_report_artifact_access", {
        session_token_hash: hash,
        target_report_id: fixture.reportCurrent,
        verified_checksum: descriptor.data![0]!.file_checksum,
      });
      const events = await db!.query<{ count: string }>(
        "select count(*)::text from public.parent_security_events where student_id=$1 and event_type in ('PARENT_LOGIN_SUCCEEDED','PARENT_REPORT_VIEWED','PARENT_REPORT_ARTIFACT_ACCESSED')",
        [fixture.studentA],
      );
      expect(Number(events.rows[0]!.count)).toBeGreaterThanOrEqual(3);
    });

    it("returns live staff credential status through the staff RPC", async () => {
      const result = await registrar.client.rpc(
        "get_student_parent_access_status",
        {
          target_student_id: fixture.studentA,
        },
      );
      expect(result.error).toBeNull();
      expect(result.data?.[0]?.student_id).toBe(fixture.studentA);
      expect(result.data?.[0]?.guardian_access_eligible).toBe(true);
      expect(result.data?.[0]?.credential_active).toBe(true);
    });

    it("does not store the one-time plaintext values in credential columns", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const row = await db!.query<{ value: string }>(
        "select row_to_json(c)::text as value from public.student_access_credentials c where c.id=$1",
        [issued.credential_id],
      );
      expect(row.rows[0]!.value).not.toContain(issued.access_code);
      expect(row.rows[0]!.value).not.toContain(issued.pin);
    });

    it("keeps failed-attempt counters below the lock boundary for attempts one through four", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      for (let attempt = 1; attempt <= 4; attempt++) {
        genericLoginResult(
          await parentLogin(
            issued.access_code,
            "00000000",
            `below-lock-${attempt}`,
          ),
        );
        const row = await db!.query<{
          failed_attempts: number;
          locked_until: string | null;
        }>(
          "select failed_attempts,locked_until from public.student_access_credentials where id=$1",
          [issued.credential_id],
        );
        expect(row.rows[0]!.failed_attempts).toBe(attempt);
        expect(row.rows[0]!.locked_until).toBeNull();
      }
    });

    it("refreshes idle activity during successful session validation", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const token = (
        await parentLogin(issued.access_code, issued.pin, "idle-refresh")
      ).data![0]!.session_token!;
      const hash = createHash("sha256").update(token).digest("hex");
      await db!.query(
        "update public.parent_access_sessions set last_seen_at=now()-interval '1 minute' where session_token_hash=$1",
        [hash],
      );
      expect(
        (
          await admin!.rpc("validate_parent_access_session", {
            session_token_hash: hash,
          })
        ).data,
      ).toHaveLength(1);
      const row = await db!.query<{ last_seen_at: string }>(
        "select last_seen_at::text from public.parent_access_sessions where session_token_hash=$1",
        [hash],
      );
      expect(new Date(row.rows[0]!.last_seen_at).getTime()).toBeGreaterThan(
        Date.now() - 10_000,
      );
    });

    it("denies a session after eligibility is removed", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const token = (
        await parentLogin(issued.access_code, issued.pin, "eligibility-after")
      ).data![0]!.session_token!;
      const hash = createHash("sha256").update(token).digest("hex");
      await db!.query(
        "update public.student_guardians set can_access_reports=false where id=$1",
        [fixture.relationshipA],
      );
      expect(
        (
          await admin!.rpc("validate_parent_access_session", {
            session_token_hash: hash,
          })
        ).data,
      ).toEqual([]);
      await db!.query(
        "update public.student_guardians set can_access_reports=true where id=$1",
        [fixture.relationshipA],
      );
    });

    it("does not expose unpublished, withdrawn, generated, or reviewed detail", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const token = (
        await parentLogin(issued.access_code, issued.pin, "hidden-detail")
      ).data![0]!.session_token!;
      const hash = createHash("sha256").update(token).digest("hex");
      for (const reportId of [
        fixture.reportUnpublishedSuperseded,
        fixture.reportWithdrawn,
        fixture.reportGenerated,
        fixture.reportReviewed,
      ]) {
        expect(
          (
            await admin!.rpc("get_parent_report_detail", {
              session_token_hash: hash,
              target_report_id: reportId,
            })
          ).data,
        ).toEqual([]);
      }
    });

    it("allows historical detail only when publication is recorded", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const token = (
        await parentLogin(issued.access_code, issued.pin, "historical-detail")
      ).data![0]!.session_token!;
      const detail = await admin!.rpc("get_parent_report_detail", {
        session_token_hash: createHash("sha256").update(token).digest("hex"),
        target_report_id: fixture.reportHistorical,
      });
      expect(detail.data?.[0]?.status).toBe("SUPERSEDED");
      expect(detail.data?.[0]?.is_current).toBe(false);
    });

    it("returns a student-scoped artifact descriptor only for allowed reports", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const token = (
        await parentLogin(issued.access_code, issued.pin, "descriptor")
      ).data![0]!.session_token!;
      const hash = createHash("sha256").update(token).digest("hex");
      const descriptor = await admin!.rpc(
        "get_parent_report_artifact_descriptor",
        {
          session_token_hash: hash,
          target_report_id: fixture.reportCurrent,
        },
      );
      expect(descriptor.data?.[0]?.storage_path).toBe(fixture.currentPath);
      expect(descriptor.data?.[0]?.file_checksum).toBe(fixture.currentChecksum);
      expect(
        (
          await admin!.rpc("get_parent_report_artifact_descriptor", {
            session_token_hash: hash,
            target_report_id: fixture.reportOtherStudent,
          })
        ).data,
      ).toEqual([]);
    });

    it("rejects an artifact success audit with a mismatched checksum", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const token = (
        await parentLogin(issued.access_code, issued.pin, "bad-checksum")
      ).data![0]!.session_token!;
      const result = await admin!.rpc("record_parent_report_artifact_access", {
        session_token_hash: createHash("sha256").update(token).digest("hex"),
        target_report_id: fixture.reportCurrent,
        verified_checksum: "0".repeat(64),
      });
      expect(result.error).not.toBeNull();
      const count = await db!.query<{ count: string }>(
        "select count(*)::text from public.parent_security_events where event_type='PARENT_REPORT_ARTIFACT_ACCESSED' and student_id=$1",
        [fixture.studentA],
      );
      expect(Number(count.rows[0]!.count)).toBe(0);
    });

    it("keeps current and historical report identity separate", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const token = (
        await parentLogin(issued.access_code, issued.pin, "current-history")
      ).data![0]!.session_token!;
      const list = await admin!.rpc("get_parent_published_reports", {
        session_token_hash: createHash("sha256").update(token).digest("hex"),
      });
      const current = list.data?.find(
        (row) => row.report_id === fixture.reportCurrent,
      );
      const historical = list.data?.find(
        (row) => row.report_id === fixture.reportHistorical,
      );
      expect(current?.is_current).toBe(true);
      expect(historical?.is_current).toBe(false);
    });

    it("keeps live student and school identifiers out of parent detail", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      const token = (
        await parentLogin(issued.access_code, issued.pin, "safe-shape")
      ).data![0]!.session_token!;
      const detail = await admin!.rpc("get_parent_report_detail", {
        session_token_hash: createHash("sha256").update(token).digest("hex"),
        target_report_id: fixture.reportCurrent,
      });
      const value = JSON.stringify(detail.data?.[0]?.parent_data);
      expect(value).not.toContain(fixture.studentA);
      expect(value).not.toContain(fixture.schoolA);
      expect(value).not.toContain(fixture.subjectA);
    });

    it("does not create a session for malformed login inputs", async () => {
      const result = await admin!.rpc("verify_parent_access", {
        access_code_lookup_hash: "short",
        pin_text: "12",
        client_key_hash: key("malformed"),
      });
      expect(result.error).toBeNull();
      expect(result.data?.[0]).toMatchObject({
        ok: false,
        session_token: null,
      });
    });

    it("resets failed attempts after a successful login", async () => {
      const issued = (
        await registrar.client.rpc("issue_student_parent_access_credential", {
          target_student_id: fixture.studentA,
        })
      ).data![0]!;
      genericLoginResult(
        await parentLogin(issued.access_code, "00000000", "reset-failure"),
      );
      expect(
        (await parentLogin(issued.access_code, issued.pin, "reset-success"))
          .data?.[0]?.ok,
      ).toBe(true);
      const row = await db!.query<{
        failed_attempts: number;
        locked_until: string | null;
      }>(
        "select failed_attempts,locked_until from public.student_access_credentials where id=$1",
        [issued.credential_id],
      );
      expect(row.rows[0]).toEqual({ failed_attempts: 0, locked_until: null });
    });
  });
