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
const db = enabled ? new Client({ connectionString: databaseUrl! }) : null;
const admin = enabled
  ? createClient<Database>(url!, serviceKey!, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })
  : null;
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
const staffPassword = "stage15-concurrency-synthetic-password";
const waitTimeoutMs = 8_000;
const testTimeoutMs = 30_000;
const createdUsers: string[] = [];

type Staff = {
  client: SupabaseClient<Database>;
  membershipId: string;
};

type RpcResult<T> = {
  data: T | null;
  error: { code?: string; message: string } | null;
};

type ParentLoginRow = {
  ok: boolean;
  session_token: string | null;
  retry_after_seconds: number;
};

let registrar: Staff;
let publisher: Staff;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function clientKey(label: string) {
  return hash(`stage15-concurrency-${label}-${randomUUID()}`);
}

function parentClient() {
  return createClient<Database>(url!, serviceKey!, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function rpcCall<T>(
  client: SupabaseClient<Database>,
  functionName: string,
  args: Record<string, unknown>,
) {
  return Promise.resolve(
    client.rpc(functionName as never, args as never) as unknown as PromiseLike<
      RpcResult<T>
    >,
  );
}

async function login(
  client: SupabaseClient<Database>,
  label: string,
  suppliedPin = pin,
): Promise<RpcResult<ParentLoginRow[]>> {
  return rpcCall<ParentLoginRow[]>(client, "verify_parent_access", {
    access_code_lookup_hash: hash(accessCode),
    pin_text: suppliedPin,
    client_key_hash: clientKey(label),
  });
}

async function openConnection() {
  const connection = new Client({ connectionString: databaseUrl! });
  await connection.connect();
  return connection;
}

async function createStaff(label: string, role: string): Promise<Staff> {
  const email = `stage15.${label}.${randomUUID()}@example.invalid`;
  const created = await admin!.auth.admin.createUser({
    email,
    password: staffPassword,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  createdUsers.push(created.data.user.id);
  const membershipId = randomUUID();
  await db!.query(
    "insert into public.profiles(id,first_name,last_name) values($1,$2,'Concurrency Test')",
    [created.data.user.id, label],
  );
  await db!.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [
      membershipId,
      ids.school,
      created.data.user.id,
      `ST15-${label}-${randomUUID().slice(0, 8)}`,
    ],
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
  const signedIn = await client.auth.signInWithPassword({
    email,
    password: staffPassword,
  });
  if (signedIn.error) throw signedIn.error;
  const selected = await client.rpc("set_my_active_membership", {
    target_membership_id: membershipId,
  });
  if (selected.error) throw selected.error;
  return { client, membershipId };
}

async function resetCredential() {
  await db!.query(
    "update public.parent_access_sessions set revoked_at=coalesce(revoked_at,now()) where student_access_credential_id in (select id from public.student_access_credentials where student_id=$1)",
    [ids.student],
  );
  await db!.query(
    "update public.student_access_credentials set is_active=false,failed_attempts=0,locked_until=null,expires_at=null where student_id=$1",
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
  await db!.query(
    "update public.reports set status='PUBLISHED',withdrawn_at=null,withdrawn_by=null,withdrawal_reason=null where id=$1",
    [ids.report],
  );
}

async function waitForBlockedCall(functionName: string, minimum = 1) {
  const deadline = Date.now() + waitTimeoutMs;
  while (Date.now() < deadline) {
    const result = await db!.query<{ count: number }>(
      `select count(*)::int as count
         from pg_stat_activity
        where pid <> pg_backend_pid()
          and state = 'active'
          and wait_event_type = 'Lock'
          and query ilike '%' || $1 || '%'`,
      [functionName],
    );
    if ((result.rows[0]?.count ?? 0) >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(
    `Timed out waiting for ${minimum} blocked ${functionName} call(s).`,
  );
}

async function activeCredentialState() {
  return db!.query<{
    id: string;
    is_active: boolean;
    pin_hash: string;
    active_count: string;
  }>(
    `select credential.id,credential.is_active,credential.pin_hash,
            (select count(*)::text from public.student_access_credentials
             where student_id=$1 and is_active) as active_count
       from public.student_access_credentials credential
      where credential.student_id=$1
      order by credential.created_at desc`,
    [ids.student],
  );
}

async function sessionIsUsable(token: string) {
  const result = await admin!.rpc("validate_parent_access_session", {
    session_token_hash: hash(token),
  });
  return (result.data ?? []).length === 1;
}

describe
  .skipIf(!enabled)
  .sequential("nine genuine Stage 15 authorization races", () => {
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
      const checksum = hash(bytes.toString());
      const storagePath = `${ids.report}/${checksum}.pdf`;
      const uploaded = await admin!.storage
        .from("report-artifacts")
        .upload(storagePath, bytes, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploaded.error) throw uploaded.error;
      await db!.query(
        `insert into public.reports(id,batch_id,term_id,enrollment_id,version,status,reviewed_at,published_at,pdf_storage_path,file_checksum,pdf_size_bytes,pdf_stored_at,pdf_renderer_version) values($1,$2,$3,$4,1,'PUBLISHED',now(),now(),$5,$6,$7,now(),'race')`,
        [
          ids.report,
          ids.batch,
          ids.term,
          ids.enrollment,
          storagePath,
          checksum,
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
      registrar = await createStaff("Registrar", "SCHOOL_ADMIN");
      publisher = await createStaff("Publisher", "SCHOOL_ADMIN");
    });

    afterAll(async () => {
      await admin!.storage
        .from("report-artifacts")
        .remove([`${ids.report}/${hash("%PDF-race")}.pdf`]);
      for (const userId of createdUsers)
        await admin!.auth.admin.deleteUser(userId);
      await db?.end();
    });

    it(
      "preserves every failed increment when wrong-PIN calls overlap",
      async () => {
        await resetCredential();
        const blocker = await openConnection();
        const clients = [parentClient(), parentClient(), parentClient()];
        let pending: Promise<unknown>[] = [];
        try {
          await blocker.query("begin");
          await blocker.query(
            "select id from public.student_access_credentials where id=$1 for update",
            [ids.credential],
          );
          pending = clients.map((client, index) =>
            login(client, `wrong-pin-${index}`, "00000000"),
          );
          await waitForBlockedCall("verify_parent_access", 3);
          await blocker.query("commit");
          const results = await Promise.all(pending);
          expect(
            results.every(
              (result) =>
                (result as { error: unknown }).error === null &&
                (result as { data?: Array<{ ok: boolean }> }).data?.[0]?.ok ===
                  false,
            ),
          ).toBe(true);
          const row = await db!.query<{ failed_attempts: number }>(
            "select failed_attempts from public.student_access_credentials where id=$1",
            [ids.credential],
          );
          expect(row.rows[0]!.failed_attempts).toBe(3);
        } finally {
          await blocker.query("rollback").catch(() => undefined);
          await Promise.all(pending.map((call) => call.catch(() => undefined)));
          await blocker.end();
        }
      },
      testTimeoutMs,
    );

    it(
      "produces one coherent threshold lock for five overlapping failures",
      async () => {
        await resetCredential();
        const blocker = await openConnection();
        const clients = Array.from({ length: 5 }, () => parentClient());
        let pending: Promise<unknown>[] = [];
        try {
          await blocker.query("begin");
          await blocker.query(
            "select id from public.student_access_credentials where id=$1 for update",
            [ids.credential],
          );
          pending = clients.map((client, index) =>
            login(client, `threshold-${index}`, "00000000"),
          );
          await waitForBlockedCall("verify_parent_access", 5);
          await blocker.query("commit");
          await Promise.all(pending);
          const row = await db!.query<{
            failed_attempts: number;
            locked_until: string | null;
          }>(
            "select failed_attempts,locked_until from public.student_access_credentials where id=$1",
            [ids.credential],
          );
          expect(row.rows[0]!.failed_attempts).toBe(5);
          expect(row.rows[0]!.locked_until).not.toBeNull();
          expect(
            (await login(parentClient(), "threshold-correct")).data?.[0]?.ok,
          ).toBe(false);
        } finally {
          await blocker.query("rollback").catch(() => undefined);
          await Promise.all(pending.map((call) => call.catch(() => undefined)));
          await blocker.end();
        }
      },
      testTimeoutMs,
    );

    it(
      "uses overlapping authorized rotation RPCs and leaves one active credential",
      async () => {
        await resetCredential();
        const oldSession = (await login(parentClient(), "rotation-seed"))
          .data![0]!.session_token!;
        const blocker = await openConnection();
        let first: Promise<RpcResult<unknown[]>> | undefined;
        let second: Promise<RpcResult<unknown[]>> | undefined;
        try {
          await blocker.query("begin");
          await blocker.query(
            "select id from public.students where id=$1 for update",
            [ids.student],
          );
          first = rpcCall(
            registrar.client,
            "issue_student_parent_access_credential",
            {
              target_student_id: ids.student,
            },
          );
          second = rpcCall(
            publisher.client,
            "issue_student_parent_access_credential",
            {
              target_student_id: ids.student,
            },
          );
          await waitForBlockedCall("issue_student_parent_access_credential", 2);
          await blocker.query("commit");
          const results = await Promise.all([first, second]);
          expect(results.every((result) => result.error === null)).toBe(true);
          const state = await activeCredentialState();
          expect(state.rows.filter((row) => row.is_active)).toHaveLength(1);
          expect(state.rows[0]!.active_count).toBe("1");
          expect(
            state.rows.filter((row) => /^\$2/.test(row.pin_hash)),
          ).toHaveLength(state.rows.length);
          expect(await sessionIsUsable(oldSession)).toBe(false);
          const audits = await db!.query<{ count: string }>(
            "select count(*)::text from public.audit_logs where action='PARENT_ACCESS_CREDENTIAL_ROTATED' and entity_type='student_access_credential'",
          );
          expect(Number(audits.rows[0]!.count)).toBeGreaterThanOrEqual(2);
        } finally {
          await blocker.query("rollback").catch(() => undefined);
          await Promise.all(
            [first, second]
              .filter((call): call is Promise<RpcResult<unknown[]>> =>
                Boolean(call),
              )
              .map((call) => call.catch(() => undefined)),
          );
          await blocker.end();
        }
      },
      testTimeoutMs,
    );

    it(
      "makes eligibility removal win after login is proven blocked",
      async () => {
        await resetCredential();
        const before = await db!.query<{ successes: string; sessions: string }>(
          "select (select count(*)::text from public.parent_security_events where event_type='PARENT_LOGIN_SUCCEEDED' and student_id=$1) as successes,(select count(*)::text from public.parent_access_sessions where student_access_credential_id=$2 and revoked_at is null) as sessions",
          [ids.student, ids.credential],
        );
        const blocker = await openConnection();
        let pending: Promise<unknown> | undefined;
        try {
          await blocker.query("begin");
          await blocker.query(
            "select id from public.student_guardians where id=$1 for update",
            [ids.relationship],
          );
          await blocker.query(
            "update public.student_guardians set can_access_reports=false where id=$1",
            [ids.relationship],
          );
          pending = login(parentClient(), "eligibility-removal-wins");
          await waitForBlockedCall("verify_parent_access");
          await blocker.query("commit");
          const result = (await pending) as {
            data?: Array<{ ok: boolean; session_token: string | null }>;
          };
          expect(result.data?.[0]).toMatchObject({
            ok: false,
            session_token: null,
          });
          const after = await db!.query<{
            successes: string;
            sessions: string;
          }>(
            "select (select count(*)::text from public.parent_security_events where event_type='PARENT_LOGIN_SUCCEEDED' and student_id=$1) as successes,(select count(*)::text from public.parent_access_sessions where student_access_credential_id=$2 and revoked_at is null) as sessions",
            [ids.student, ids.credential],
          );
          expect(after.rows[0]).toEqual(before.rows[0]);
          expect(
            (await activeCredentialState()).rows.find((row) => row.is_active)
              ?.is_active,
          ).toBe(true);
        } finally {
          await blocker.query("rollback").catch(() => undefined);
          await pending?.catch(() => undefined);
          await blocker.end();
          await resetCredential();
        }
      },
      testTimeoutMs,
    );

    it(
      "queues login ahead of the real eligibility-removal RPC",
      async () => {
        await resetCredential();
        const blocker = await openConnection();
        let loginCall: ReturnType<typeof login> | undefined;
        let removalCall: Promise<RpcResult<unknown[]>> | undefined;
        try {
          const current = await db!.query<{ updated_at: string }>(
            "select updated_at from public.student_guardians where id=$1",
            [ids.relationship],
          );
          await blocker.query("begin");
          await blocker.query(
            "select id from public.student_guardians where id=$1 for update",
            [ids.relationship],
          );
          loginCall = login(parentClient(), "eligibility-login-wins");
          await waitForBlockedCall("verify_parent_access");
          removalCall = rpcCall(
            registrar.client,
            "update_student_guardian_relationship",
            {
              target_relationship_id: ids.relationship,
              expected_updated_at: current.rows[0]!.updated_at,
              relationship: "Parent",
              primary_guardian: true,
              report_access_eligible: false,
            },
          );
          await waitForBlockedCall("update_student_guardian_relationship");
          await blocker.query("commit");
          const loginResult = await loginCall;
          const removalResult = await removalCall;
          expect(loginResult.data?.[0]?.ok).toBe(true);
          expect(removalResult.error).toBeNull();
          expect(
            await sessionIsUsable(loginResult.data![0]!.session_token!),
          ).toBe(false);
          expect(
            (
              await db!.query<{ can_access_reports: boolean }>(
                "select can_access_reports from public.student_guardians where id=$1",
                [ids.relationship],
              )
            ).rows[0]!.can_access_reports,
          ).toBe(false);
        } finally {
          await blocker.query("rollback").catch(() => undefined);
          await loginCall?.catch(() => undefined);
          await removalCall?.catch(() => undefined);
          await blocker.end();
          await resetCredential();
        }
      },
      testTimeoutMs,
    );

    it(
      "makes the real revoke RPC win before a pending parent login",
      async () => {
        await resetCredential();
        const blocker = await openConnection();
        let revokeCall: Promise<RpcResult<boolean>> | undefined;
        let loginCall: ReturnType<typeof login> | undefined;
        try {
          await blocker.query("begin");
          await blocker.query(
            "select id from public.student_access_credentials where id=$1 for update",
            [ids.credential],
          );
          revokeCall = rpcCall(
            registrar.client,
            "revoke_student_parent_access_credential",
            { target_student_id: ids.student },
          );
          await waitForBlockedCall("revoke_student_parent_access_credential");
          loginCall = login(parentClient(), "revocation-wins");
          await waitForBlockedCall("verify_parent_access");
          await blocker.query("commit");
          const [revokeResult, loginResult] = await Promise.all([
            revokeCall,
            loginCall,
          ]);
          expect(revokeResult.error).toBeNull();
          expect(revokeResult.data).toBe(true);
          expect(loginResult.data?.[0]).toMatchObject({
            ok: false,
            session_token: null,
          });
          expect(
            (await activeCredentialState()).rows.some((row) => row.is_active),
          ).toBe(false);
          const successes = await db!.query<{ count: string }>(
            "select count(*)::text from public.parent_security_events where event_type='PARENT_LOGIN_SUCCEEDED' and student_id=$1",
            [ids.student],
          );
          expect(Number(successes.rows[0]!.count)).toBe(0);
        } finally {
          await blocker.query("rollback").catch(() => undefined);
          await revokeCall?.catch(() => undefined);
          await loginCall?.catch(() => undefined);
          await blocker.end();
          await resetCredential();
        }
      },
      testTimeoutMs,
    );

    it(
      "lets login pass first, then makes the real revoke RPC invalidate it",
      async () => {
        await resetCredential();
        const blocker = await openConnection();
        let loginCall: ReturnType<typeof login> | undefined;
        let revokeCall: Promise<RpcResult<boolean>> | undefined;
        try {
          await blocker.query("begin");
          await blocker.query(
            "select id from public.student_access_credentials where id=$1 for update",
            [ids.credential],
          );
          loginCall = login(parentClient(), "login-revocation-wins");
          await waitForBlockedCall("verify_parent_access");
          revokeCall = rpcCall(
            registrar.client,
            "revoke_student_parent_access_credential",
            { target_student_id: ids.student },
          );
          await waitForBlockedCall("revoke_student_parent_access_credential");
          await blocker.query("commit");
          const [loginResult, revokeResult] = await Promise.all([
            loginCall,
            revokeCall,
          ]);
          expect(loginResult.data?.[0]?.ok).toBe(true);
          expect(revokeResult.error).toBeNull();
          expect(
            await sessionIsUsable(loginResult.data![0]!.session_token!),
          ).toBe(false);
          expect(
            (await activeCredentialState()).rows.some((row) => row.is_active),
          ).toBe(false);
        } finally {
          await blocker.query("rollback").catch(() => undefined);
          await loginCall?.catch(() => undefined);
          await revokeCall?.catch(() => undefined);
          await blocker.end();
          await resetCredential();
        }
      },
      testTimeoutMs,
    );

    it(
      "makes credential rotation win a queued session validation",
      async () => {
        await resetCredential();
        const token = (await login(parentClient(), "session-rotation"))
          .data![0]!.session_token!;
        const blocker = await openConnection();
        let rotationCall: Promise<RpcResult<unknown[]>> | undefined;
        let validationCall: Promise<RpcResult<unknown[]>> | undefined;
        try {
          await blocker.query("begin");
          await blocker.query(
            "select id from public.parent_access_sessions where session_token_hash=$1 for update",
            [hash(token)],
          );
          rotationCall = rpcCall(
            registrar.client,
            "issue_student_parent_access_credential",
            { target_student_id: ids.student },
          );
          await waitForBlockedCall("issue_student_parent_access_credential");
          validationCall = rpcCall(admin!, "validate_parent_access_session", {
            session_token_hash: hash(token),
          });
          await waitForBlockedCall("validate_parent_access_session");
          await blocker.query("commit");
          const [rotation, validation] = await Promise.all([
            rotationCall,
            validationCall,
          ]);
          expect(rotation.error).toBeNull();
          expect(validation.error).toBeNull();
          expect(validation.data).toEqual([]);
          expect(await sessionIsUsable(token)).toBe(false);
        } finally {
          await blocker.query("rollback").catch(() => undefined);
          await rotationCall?.catch(() => undefined);
          await validationCall?.catch(() => undefined);
          await blocker.end();
          await resetCredential();
        }
      },
      testTimeoutMs,
    );

    it(
      "denies final artifact authorization when real withdrawal wins",
      async () => {
        await resetCredential();
        const token = (await login(parentClient(), "artifact-withdrawal"))
          .data![0]!.session_token!;
        const sessionHash = hash(token);
        const descriptor = await admin!.rpc(
          "get_parent_report_artifact_descriptor",
          {
            session_token_hash: sessionHash,
            target_report_id: ids.report,
          },
        );
        expect(descriptor.data).toHaveLength(1);
        const artifact = await admin!.storage
          .from("report-artifacts")
          .download(descriptor.data![0]!.storage_path);
        expect(artifact.error).toBeNull();
        const bytes = Buffer.from(await artifact.data!.arrayBuffer());
        expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
        const checksum = createHash("sha256").update(bytes).digest("hex");
        expect(checksum).toBe(descriptor.data![0]!.file_checksum);

        const blocker = await openConnection();
        let withdrawalCall: Promise<RpcResult<unknown[]>> | undefined;
        let finalAuthorizationCall: Promise<RpcResult<boolean>> | undefined;
        try {
          const report = await db!.query<{ workflow_version: string }>(
            "select workflow_version::text from public.reports where id=$1",
            [ids.report],
          );
          await blocker.query("begin");
          await blocker.query(
            "select id from public.reports where id=$1 for update",
            [ids.report],
          );
          withdrawalCall = rpcCall(
            publisher.client,
            "withdraw_published_report",
            {
              target_report_id: ids.report,
              expected_workflow_version: Number(
                report.rows[0]!.workflow_version,
              ),
              withdrawal_reason: "Concurrency withdrawal proof",
            },
          );
          await waitForBlockedCall("withdraw_published_report");
          finalAuthorizationCall = rpcCall(
            admin!,
            "record_parent_report_artifact_access",
            {
              session_token_hash: sessionHash,
              target_report_id: ids.report,
              verified_checksum: checksum,
            },
          );
          await waitForBlockedCall("record_parent_report_artifact_access");
          await blocker.query("commit");
          const [withdrawal, finalAuthorization] = await Promise.all([
            withdrawalCall,
            finalAuthorizationCall,
          ]);
          expect(withdrawal.error).toBeNull();
          expect(finalAuthorization.error).toBeNull();
          expect(finalAuthorization.data).toBe(false);
          const reportAfter = await db!.query<{ status: string }>(
            "select status from public.reports where id=$1",
            [ids.report],
          );
          expect(reportAfter.rows[0]!.status).toBe("WITHDRAWN");
          const audits = await db!.query<{ count: string }>(
            "select count(*)::text from public.audit_logs where action='PARENT_REPORT_ARTIFACT_ACCESSED' and entity_id=$1",
            [ids.report],
          );
          expect(audits.rows[0]!.count).toBe("0");
        } finally {
          await blocker.query("rollback").catch(() => undefined);
          await withdrawalCall?.catch(() => undefined);
          await finalAuthorizationCall?.catch(() => undefined);
          await blocker.end();
          await resetCredential();
        }
      },
      testTimeoutMs,
    );
  });
