import { createHash, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/types/database.generated";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL;
const enabled = Boolean(url && anonKey && serviceKey && databaseUrl);
const db = enabled ? new Client({ connectionString: databaseUrl! }) : null;
const admin = enabled ? createClient<Database>(url!, serviceKey!) : null;
const ids = Object.fromEntries(
  [
    "school",
    "year",
    "grade",
    "section",
    "term",
    "subject",
    "student",
    "enrollment",
    "guardian",
    "relationship",
    "batch",
    "report",
    "credential",
  ].map((key) => [key, randomUUID()]),
) as Record<string, string>;
const accessCode = "STAGE15-CONCURRENT-ACCESS";
const pin = "12345678";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function clientKey(label: string) {
  return hash(`stage15-concurrency-${label}`);
}

async function login(label: string, suppliedPin = pin) {
  return admin!.rpc("verify_parent_access", {
    access_code_lookup_hash: hash(accessCode),
    pin_text: suppliedPin,
    client_key_hash: clientKey(label),
  });
}

async function resetCredential() {
  await db!.query(
    "update public.student_access_credentials set is_active=false where student_id=$1",
    [ids.student],
  );
  await db!.query(
    `update public.student_access_credentials
        set is_active=true, failed_attempts=0, locked_until=null, expires_at=null
      where id=$1`,
    [ids.credential],
  );
  await db!.query(
    "update public.student_guardians set can_access_reports=true where id=$1",
    [ids.relationship],
  );
}

async function openConnection() {
  const connection = new Client({ connectionString: databaseUrl! });
  await connection.connect();
  return connection;
}

describe
  .skipIf(!enabled)
  .sequential("distinct Stage 15 authorization races", () => {
    beforeAll(async () => {
      await db!.connect();
      await db!.query(
        `insert into public.schools(id,name,slug,school_code) values($1,'Concurrency School',$2,'C15')`,
        [ids.school, `concurrency-${randomUUID()}`],
      );
      await db!.query(
        `insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,'2026','2026-01-01','2026-12-31','ACTIVE')`,
        [ids.year, ids.school],
      );
      await db!.query(
        `insert into public.grade_levels(id,school_id,code,name,sort_order) values($1,$2,'P1','Primary One',1)`,
        [ids.grade, ids.school],
      );
      await db!.query(
        `insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code,capacity) values($1,$2,$3,'P1 A','P1-A',30)`,
        [ids.section, ids.year, ids.grade],
      );
      await db!.query(
        `insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status) values($1,$2,'Term One',1,'2026-01-01','2026-04-30','MARKS_ENTRY')`,
        [ids.term, ids.year],
      );
      await db!.query(
        `insert into public.subjects(id,school_id,code,name,sort_order) values($1,$2,'RACE','Race Subject',1)`,
        [ids.subject, ids.school],
      );
      await db!.query(
        `insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date) values($1,$2,'RACE-A','Race','Student','2026-01-01')`,
        [ids.student, ids.school],
      );
      await db!.query(
        `insert into public.enrollments(id,student_id,academic_year_id,class_section_id,class_number,status,enrolled_on) values($1,$2,$3,$4,'1','ACTIVE','2026-01-01')`,
        [ids.enrollment, ids.student, ids.year, ids.section],
      );
      await db!.query(
        `insert into public.guardians(id,school_id,first_name,last_name,is_active) values($1,$2,'Race','Guardian',true)`,
        [ids.guardian, ids.school],
      );
      await db!.query(
        `insert into public.student_guardians(id,student_id,guardian_id,relationship,is_primary,can_access_reports) values($1,$2,$3,'Parent',true,true)`,
        [ids.relationship, ids.student, ids.guardian],
      );
      await db!.query(
        `insert into public.student_access_credentials(id,student_id,access_code_lookup_hash,pin_hash,is_active) values($1,$2,$3,extensions.crypt($4,extensions.gen_salt('bf',12)),true)`,
        [ids.credential, ids.student, hash(accessCode), pin],
      );
      await db!.query(
        `insert into public.report_batches(id,term_id,class_section_id,status,total_reports,completed_reports) values($1,$2,$3,'COMPLETED',1,1)`,
        [ids.batch, ids.term, ids.section],
      );
      const bytes = Buffer.from("%PDF-race");
      await db!.query(
        `insert into public.reports(id,batch_id,term_id,enrollment_id,version,status,reviewed_at,published_at,pdf_storage_path,file_checksum,pdf_size_bytes,pdf_stored_at,pdf_renderer_version) values($1,$2,$3,$4,1,'PUBLISHED',now(),now(),$5,$6,$7,now(),'race')`,
        [
          ids.report,
          ids.batch,
          ids.term,
          ids.enrollment,
          `${ids.report}/${hash(bytes.toString())}.pdf`,
          hash(bytes.toString()),
          bytes.length,
        ],
      );
      await db!.query(
        `insert into public.report_snapshots(report_id,snapshot_version,snapshot_data,source_checksum) values($1,$2,'{"student":{"display_name":"Race Student"}}','race-snapshot')`,
        [ids.report, 1],
      );
      await db!.query(
        `insert into public.report_subject_results(report_id,subject_id,sort_order,subject_code,subject_name) values($1,$2,1,'RACE','Race Subject')`,
        [ids.report, ids.subject],
      );
    });

    afterAll(async () => {
      await db?.end();
    });

    it("wrong-PIN counter race preserves every failed increment", async () => {
      await resetCredential();
      const results = await Promise.all([
        login("wrong-pin-a", "00000000"),
        login("wrong-pin-b", "00000000"),
        login("wrong-pin-c", "00000000"),
      ]);
      expect(
        results.every(
          (result) => result.error === null && result.data?.[0]?.ok === false,
        ),
      ).toBe(true);
      const row = await db!.query<{ failed_attempts: number }>(
        "select failed_attempts from public.student_access_credentials where id=$1",
        [ids.credential],
      );
      expect(row.rows[0]!.failed_attempts).toBe(3);
    });

    it("threshold-lock race produces one coherent five-attempt lock", async () => {
      await resetCredential();
      await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          login(`threshold-${index}`, "00000000"),
        ),
      );
      const row = await db!.query<{
        failed_attempts: number;
        locked_until: string | null;
      }>(
        "select failed_attempts,locked_until from public.student_access_credentials where id=$1",
        [ids.credential],
      );
      expect(row.rows[0]!.failed_attempts).toBe(5);
      expect(row.rows[0]!.locked_until).not.toBeNull();
      expect((await login("threshold-correct")).data?.[0]?.ok).toBe(false);
    });

    it("credential rotation race leaves one active credential and revokes old sessions", async () => {
      await resetCredential();
      const session = (await login("rotation-seed")).data![0]!.session_token!;
      const oldHash = hash(session);
      const connections = await Promise.all([
        openConnection(),
        openConnection(),
      ]);
      await Promise.all(
        connections.map(async (connection, index) => {
          await connection.query("begin");
          await connection.query(
            "select id from public.student_access_credentials where student_id=$1 and is_active for update",
            [ids.student],
          );
          await connection.query(
            "update public.student_access_credentials set is_active=false where student_id=$1 and is_active",
            [ids.student],
          );
          await connection.query(
            "update public.parent_access_sessions set revoked_at=coalesce(revoked_at,now()) where student_access_credential_id=$1 and revoked_at is null",
            [ids.credential],
          );
          await connection.query(
            "insert into public.student_access_credentials(student_id,access_code_lookup_hash,pin_hash,is_active) values($1,$2,extensions.crypt($3,extensions.gen_salt('bf',12)),true)",
            [ids.student, hash(`ROTATION-${index}-${randomUUID()}`), pin],
          );
          await connection.query("commit");
        }),
      );
      await Promise.all(connections.map((connection) => connection.end()));
      const active = await db!.query<{ count: string }>(
        "select count(*)::text from public.student_access_credentials where student_id=$1 and is_active",
        [ids.student],
      );
      expect(active.rows[0]!.count).toBe("1");
      expect(
        (
          await admin!.rpc("validate_parent_access_session", {
            session_token_hash: oldHash,
          })
        ).data,
      ).toEqual([]);
    });

    it("eligibility-removal-wins login race fails before session creation", async () => {
      await resetCredential();
      const connection = await openConnection();
      await connection.query("begin");
      await connection.query(
        "select id from public.student_guardians where id=$1 for update",
        [ids.relationship],
      );
      await connection.query(
        "update public.student_guardians set can_access_reports=false where id=$1",
        [ids.relationship],
      );
      const pending = login("eligibility-removal-wins");
      await new Promise((resolve) => setImmediate(resolve));
      await connection.query("commit");
      await connection.end();
      expect((await pending).data?.[0]?.ok).toBe(false);
      const successes = await db!.query<{ count: string }>(
        "select count(*)::text from public.parent_security_events where event_type='PARENT_LOGIN_SUCCEEDED' and student_id=$1",
        [ids.student],
      );
      expect(Number(successes.rows[0]!.count)).toBe(0);
      await resetCredential();
    });

    it("login-wins eligibility race invalidates the next protected request", async () => {
      await resetCredential();
      const token = (await login("eligibility-login-wins")).data![0]!
        .session_token!;
      await db!.query(
        "update public.student_guardians set can_access_reports=false where id=$1",
        [ids.relationship],
      );
      expect(
        (
          await admin!.rpc("validate_parent_access_session", {
            session_token_hash: hash(token),
          })
        ).data,
      ).toEqual([]);
      await resetCredential();
    });

    it("revocation-wins login race denies the login", async () => {
      await resetCredential();
      await db!.query(
        "update public.student_access_credentials set is_active=false where id=$1",
        [ids.credential],
      );
      expect((await login("revocation-wins")).data?.[0]?.ok).toBe(false);
      await resetCredential();
    });

    it("login-wins revocation race blocks subsequent use", async () => {
      await resetCredential();
      const token = (await login("login-revocation-wins")).data![0]!
        .session_token!;
      await db!.query(
        "update public.student_access_credentials set is_active=false where id=$1",
        [ids.credential],
      );
      await db!.query(
        "update public.parent_access_sessions set revoked_at=now() where session_token_hash=$1",
        [hash(token)],
      );
      expect(
        (
          await admin!.rpc("validate_parent_access_session", {
            session_token_hash: hash(token),
          })
        ).data,
      ).toEqual([]);
      await resetCredential();
    });

    it("session validation versus rotation denies the old session after rotation wins", async () => {
      await resetCredential();
      const token = (await login("session-rotation")).data![0]!.session_token!;
      expect(
        (
          await admin!.rpc("validate_parent_access_session", {
            session_token_hash: hash(token),
          })
        ).data,
      ).toHaveLength(1);
      await db!.query(
        "update public.student_access_credentials set is_active=false where id=$1",
        [ids.credential],
      );
      await db!.query(
        "update public.parent_access_sessions set revoked_at=now() where session_token_hash=$1",
        [hash(token)],
      );
      expect(
        (
          await admin!.rpc("validate_parent_access_session", {
            session_token_hash: hash(token),
          })
        ).data,
      ).toEqual([]);
      await resetCredential();
    });

    it("artifact access versus withdrawal denies the next descriptor after withdrawal wins", async () => {
      await resetCredential();
      const token = (await login("artifact-withdrawal")).data![0]!
        .session_token!;
      const sessionHash = hash(token);
      expect(
        (
          await admin!.rpc("get_parent_report_artifact_descriptor", {
            session_token_hash: sessionHash,
            target_report_id: ids.report,
          })
        ).data,
      ).toHaveLength(1);
      await db!.query(
        "update public.reports set status='WITHDRAWN',withdrawn_at=now() where id=$1",
        [ids.report],
      );
      expect(
        (
          await admin!.rpc("get_parent_report_artifact_descriptor", {
            session_token_hash: sessionHash,
            target_report_id: ids.report,
          })
        ).data,
      ).toEqual([]);
      await db!.query(
        "update public.reports set status='PUBLISHED',withdrawn_at=null where id=$1",
        [ids.report],
      );
    });
  });
