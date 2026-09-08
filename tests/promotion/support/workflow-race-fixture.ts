import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";

export type RaceActor = {
  email: string;
  userId: string;
  membershipId: string;
  role: string;
};

type RaceIds = Record<string, string> & {
  students: string[];
  enrollments: string[];
};

export type LockEvidence = {
  blocked: true;
  pid: number;
  query: string;
  applicationName: string;
  waitEvent: string | null;
  released: true;
};

export type RaceFixture = {
  ids: RaceIds;
  db: Client;
  admin: SupabaseClient;
  head: SupabaseClient;
  actors: { admin: RaceActor; head: RaceActor };
  password: string;
  close: () => Promise<void>;
  decision: (index: number) => Promise<{
    decision_id: string;
    decision_version: number;
    enrollment_id: string;
    system_recommendation: string;
  }>;
  generate: (client: SupabaseClient) => Promise<{ error: string | null }>;
  confirm: (
    client: SupabaseClient,
    index: number,
    outcome?: string,
  ) => Promise<{ error: string | null }>;
  reopen: (
    client: SupabaseClient,
    index: number,
  ) => Promise<{ error: string | null }>;
  progress: (
    client: SupabaseClient,
    index: number,
  ) => Promise<{ error: string | null; data: unknown }>;
  holdScope: <T>(
    label: string,
    callback: (
      release: () => Promise<void>,
      observe: () => Promise<Omit<LockEvidence, "released">>,
    ) => Promise<T>,
  ) => Promise<{ value: T; evidence: LockEvidence }>;
  revokeConfirm: () => Promise<void>;
  restoreConfirm: () => Promise<void>;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL;
const password = "synthetic-stage-seventeen-promotion-password";

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  SUPABASE_LOCAL_DB_URL: databaseUrl,
})) {
  if (!value) throw new Error(`${name} is required for workflow races.`);
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForLockWait(observer: Client, timeoutMs = 7000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await observer.query<{
      pid: number;
      query: string;
      application_name: string;
      wait_event: string | null;
    }>(
      `select pid, query, application_name, wait_event
       from pg_stat_activity
       where datname=current_database()
         and pid <> pg_backend_pid()
         and state='active'
         and wait_event_type='Lock'
         and application_name not like 'stage17-%-holder'
         and application_name not like 'stage17-%-observer'
         and query not like '%pg_stat_activity%'`,
    );
    const row = result.rows[0];
    if (row)
      return {
        blocked: true as const,
        pid: row.pid,
        query: row.query,
        applicationName: row.application_name,
        waitEvent: row.wait_event,
      };
    await wait(25);
  }
  throw new Error(
    "The real workflow operation did not reach a database lock before timeout.",
  );
}

async function actor(
  db: Client,
  admin: SupabaseClient,
  label: string,
  role: string,
  schoolId: string,
): Promise<RaceActor> {
  const email = `promotion.race.${label}.${Date.now()}.${randomUUID()}@example.invalid`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const membershipId = randomUUID();
  await db.query(
    "insert into public.profiles(id,first_name,last_name) values($1,$2,'Race')",
    [created.data.user.id, label],
  );
  await db.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [membershipId, schoolId, created.data.user.id, `RACE-${randomUUID()}`],
  );
  await db.query(
    "insert into public.staff_role_assignments(id,membership_id,role,granted_at) values($1,$2,$3,now()-interval '1 day')",
    [randomUUID(), membershipId, role],
  );
  return { email, userId: created.data.user.id, membershipId, role };
}

async function signIn(actorValue: RaceActor) {
  const client = createClient(url!, anonKey!, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const login = await client.auth.signInWithPassword({
    email: actorValue.email,
    password,
  });
  if (login.error) throw login.error;
  const selected = await client.rpc("set_my_active_membership", {
    target_membership_id: actorValue.membershipId,
  });
  if (selected.error) throw selected.error;
  return client;
}

async function call(
  client: SupabaseClient,
  functionName: string,
  args: Record<string, unknown>,
) {
  const result = await client.rpc(functionName, args);
  return { data: result.data, error: result.error?.message ?? null };
}

export async function createWorkflowRaceFixture(): Promise<RaceFixture> {
  const db = new Client({ connectionString: databaseUrl! });
  await db.connect();
  const admin = createClient(url!, serviceKey!, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const ids = Object.fromEntries(
    [
      "school",
      "year",
      "nextYear",
      "term",
      "grade",
      "nextGrade",
      "sourceClass",
      "targetClass",
      "subject",
      "mapping",
      "assignment",
      "scheme",
      "component",
      "sheet",
      "scale",
      "ranking",
      "classification",
      "rule",
    ].map((key) => [key, randomUUID()]),
  ) as RaceIds;
  ids.students = [];
  ids.enrollments = [];
  const fixtureCode = `RACE-${Date.now()}`;
  await db.query(
    "insert into public.schools(id,name,slug,school_code) values($1,$2,$3,$4)",
    [
      ids.school,
      "Stage 17 Workflow Race School",
      `stage17-race-${Date.now()}`,
      fixtureCode,
    ],
  );
  const adminActor = await actor(
    db,
    admin,
    "admin",
    "SCHOOL_ADMIN",
    ids.school,
  );
  const headActor = await actor(db, admin, "head", "HEAD_TEACHER", ids.school);
  await db.query(
    "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,'Race Source','2049-01-01','2049-12-31','ACTIVE'),($3,$2,'Race Next','2050-01-01','2050-12-31','DRAFT')",
    [ids.year, ids.school, ids.nextYear],
  );
  await db.query(
    "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status,is_promotion_term) values($1,$2,'Race Term',1,'2049-01-01','2049-06-30','MARKS_ENTRY',true)",
    [ids.term, ids.year],
  );
  await db.query(
    "insert into public.grade_levels(id,school_id,code,name,sort_order,is_final_grade) values($1,$2,'R1','Race Source Grade',1,false),($3,$2,'R2','Race Target Grade',2,false)",
    [ids.grade, ids.school, ids.nextGrade],
  );
  await db.query(
    "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code,capacity) values($1,$2,$3,'Race Source Class','R1-A',200),($4,$5,$6,'Race Target Class','R2-A',200)",
    [
      ids.sourceClass,
      ids.year,
      ids.grade,
      ids.targetClass,
      ids.nextYear,
      ids.nextGrade,
    ],
  );
  await db.query(
    "insert into public.subjects(id,school_id,code,name,sort_order,is_core) values($1,$2,'RACE-SUB','Race Subject',1,true)",
    [ids.subject, ids.school],
  );
  await db.query(
    "insert into public.grade_level_subjects(id,grade_level_id,subject_id,is_required,contributes_to_aggregate,sort_order) values($1,$2,$3,true,true,1)",
    [ids.mapping, ids.grade, ids.subject],
  );
  for (let index = 0; index < 12; index += 1) {
    const studentId = randomUUID();
    const enrollmentId = randomUUID();
    ids.students.push(studentId);
    ids.enrollments.push(enrollmentId);
    await db.query(
      "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date,date_of_birth,status) values($1,$2,$3,$4,'Race Learner','2049-01-02','2039-01-02','ACTIVE')",
      [
        studentId,
        ids.school,
        `${fixtureCode}-${String(index).padStart(2, "0")}`,
        `Learner${index}`,
      ],
    );
    await db.query(
      "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,status,enrolled_on) values($1,$2,$3,$4,'ACTIVE','2049-01-02')",
      [enrollmentId, studentId, ids.year, ids.sourceClass],
    );
  }
  await db.query(
    "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,'2049-01-02')",
    [
      ids.assignment,
      ids.term,
      ids.sourceClass,
      ids.subject,
      adminActor.membershipId,
    ],
  );
  await db.query(
    "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,status,effective_from,created_by) values($1,$2,$3,$4,'Race Scheme','DRAFT','2049-01-02',$5)",
    [ids.scheme, ids.term, ids.grade, ids.subject, adminActor.membershipId],
  );
  await db.query(
    "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values($1,$2,'Race Exam','RACE-EXAM',100,100,1)",
    [ids.component, ids.scheme],
  );
  await db.query(
    "update public.assessment_schemes set status='ACTIVE' where id=$1",
    [ids.scheme],
  );
  await db.query(
    "insert into public.mark_sheets(id,term_id,class_section_id,subject_id,assessment_scheme_id,teaching_assignment_id) values($1,$2,$3,$4,$5,$6)",
    [
      ids.sheet,
      ids.term,
      ids.sourceClass,
      ids.subject,
      ids.scheme,
      ids.assignment,
    ],
  );
  for (const enrollmentId of ids.enrollments) {
    await db.query(
      "insert into public.marks(mark_sheet_id,assessment_component_id,enrollment_id,score,attendance_status,created_by,updated_by) values($1,$2,$3,90,'PRESENT',$4,$4)",
      [ids.sheet, ids.component, enrollmentId, adminActor.membershipId],
    );
    await db.query(
      "insert into public.term_attendance(term_id,enrollment_id,days_open,days_present,days_absent,recorded_by) values($1,$2,100,90,10,$3)",
      [ids.term, enrollmentId, adminActor.membershipId],
    );
  }
  await db.query(
    "select set_config('app.marks_workflow_transition','allowed',false)",
  );
  await db.query(
    "update public.mark_sheets set workflow_status='LOCKED',locked_by=$2,locked_at=now() where id=$1",
    [ids.sheet, adminActor.membershipId],
  );
  await db.query(
    "select set_config('app.term_marks_workflow_transition','allowed',false)",
  );
  await db.query("update public.terms set status='LOCKED' where id=$1", [
    ids.term,
  ]);
  await db.query(
    "insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,effective_from,created_by) values($1,$2,$3,$4,'Race Scale',1,true,'2049-01-02',$5)",
    [ids.scale, ids.school, ids.year, ids.grade, adminActor.membershipId],
  );
  await db.query(
    "insert into public.grading_bands(grading_scale_id,minimum_score,maximum_score,grade,aggregate_points,is_pass,sort_order) values($1,0,50,'F',1,false,1),($1,50,100,'A',5,true,2)",
    [ids.scale],
  );
  await db.query(
    "insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,version,ranking_basis,tie_method,configuration,is_active,created_by) values($1,$2,$3,$4,'Race Ranking',1,'AVERAGE','DENSE',$5,true,$6)",
    [
      ids.ranking,
      ids.school,
      ids.year,
      ids.grade,
      JSON.stringify({
        direction: "DESC",
        include_incomplete: true,
        minimum_subjects: 1,
      }),
      adminActor.membershipId,
    ],
  );
  await db.query(
    "insert into public.aggregate_classification_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,created_by) values($1,$2,$3,$4,'Race Classification',1,true,$5)",
    [
      ids.classification,
      ids.school,
      ids.year,
      ids.grade,
      adminActor.membershipId,
    ],
  );
  await db.query(
    "insert into public.aggregate_classification_bands(scale_id,minimum_aggregate,maximum_aggregate,label,sort_order) values($1,0,5,'Ready',1)",
    [ids.classification],
  );
  await db.query(
    "insert into public.promotion_rules(id,school_id,academic_year_id,grade_level_id,name,version,minimum_average,minimum_attendance_percentage,required_subject_rules,additional_rules,is_active,created_by) values($1,$2,$3,$4,'Race Rule',1,50,80,'{}','{}',true,$5)",
    [ids.rule, ids.school, ids.year, ids.grade, adminActor.membershipId],
  );
  const adminClient = await signIn(adminActor);
  const headClient = await signIn(headActor);
  const calculated = await adminClient.rpc("calculate_grade_results", {
    target_term_id: ids.term,
    target_grade_level_id: ids.grade,
    target_grading_scale_id: ids.scale,
    target_ranking_rule_id: ids.ranking,
    target_aggregate_classification_scale_id: ids.classification,
  });
  if (calculated.error) throw calculated.error;
  const initial = await call(
    adminClient,
    "generate_promotion_recommendations",
    { target_term_id: ids.term, target_grade_level_id: ids.grade },
  );
  if (initial.error) throw new Error(initial.error);

  const fixture: RaceFixture = {
    ids,
    db,
    admin: adminClient,
    head: headClient,
    actors: { admin: adminActor, head: headActor },
    password,
    close: async () => db.end(),
    decision: async (index) => {
      const result = await db.query(
        "select decision_id, decision_version, enrollment_id, system_recommendation from (select distinct on (enrollment_id) id decision_id, version decision_version, enrollment_id, system_recommendation from public.promotion_decisions where enrollment_id=$1 order by enrollment_id, version desc, created_at desc) current",
        [ids.enrollments[index]],
      );
      if (!result.rows[0])
        throw new Error(`No current decision for race learner ${index}`);
      return result.rows[0];
    },
    generate: async (client) =>
      call(client, "generate_promotion_recommendations", {
        target_term_id: ids.term,
        target_grade_level_id: ids.grade,
      }),
    confirm: async (client, index, outcome = "PROMOTED") => {
      const decision = await fixture.decision(index);
      return call(client, "confirm_promotion_decision", {
        target_decision_id: decision.decision_id,
        expected_decision_version: decision.decision_version,
        target_final_decision: outcome,
      });
    },
    reopen: async (client, index) => {
      const decision = await fixture.decision(index);
      return call(client, "reopen_promotion_decision", {
        target_decision_id: decision.decision_id,
        expected_decision_version: decision.decision_version,
        reason: "Stage 17 concurrency acceptance reopen",
      });
    },
    progress: async (client, index) => {
      const decision = await fixture.decision(index);
      return call(client, "apply_student_progression", {
        target_decision_id: decision.decision_id,
        expected_decision_version: decision.decision_version,
        target_academic_year_id: ids.nextYear,
        target_grade_level_id: ids.nextGrade,
        target_class_section_id: ids.targetClass,
      });
    },
    holdScope: async (label, callback) => {
      const holder = new Client({
        connectionString: databaseUrl!,
        options: `-c application_name=stage17-${label}-holder`,
      });
      const observer = new Client({
        connectionString: databaseUrl!,
        options: `-c application_name=stage17-${label}-observer`,
      });
      await holder.connect();
      await observer.connect();
      await holder.query("begin");
      await holder.query(
        "select pg_advisory_xact_lock(hashtextextended($1,11011))",
        [`${ids.term}:${ids.grade}`],
      );
      let released = false;
      const release = async () => {
        if (!released) {
          released = true;
          await holder.query("commit");
        }
      };
      let observation: Omit<LockEvidence, "released"> | undefined;
      const observe = async () => {
        observation ??= await waitForLockWait(observer);
        return observation;
      };
      try {
        const value = await callback(release, observe);
        observation ??= await waitForLockWait(observer);
        if (!released) await release();
        return { value, evidence: { ...observation, released: true as const } };
      } finally {
        await holder.query("rollback").catch(() => undefined);
        await holder.end();
        await observer.end();
      }
    },
    revokeConfirm: async () => {
      await db.query(
        "delete from public.role_permissions where role='HEAD_TEACHER' and permission='PROMOTION_CONFIRM'",
      );
    },
    restoreConfirm: async () => {
      await db.query(
        "insert into public.role_permissions(role,permission) values('HEAD_TEACHER','PROMOTION_CONFIRM') on conflict do nothing",
      );
    },
  };
  return fixture;
}

export async function mutateSourceMark(fixture: RaceFixture, index = 0) {
  await fixture.db.query(
    "update public.marks set score=89 where mark_sheet_id=$1 and enrollment_id=$2",
    [fixture.ids.sheet, fixture.ids.enrollments[index]],
  );
}

export async function createNewRuleVersion(fixture: RaceFixture) {
  const source = await fixture.db.query(
    "select updated_at from public.promotion_rules where id=$1",
    [fixture.ids.rule],
  );
  const created = await fixture.admin.rpc("create_promotion_rule_version", {
    source_rule_id: fixture.ids.rule,
    expected_updated_at: source.rows[0].updated_at,
    rule_name: "Race Rule v2",
    rule_minimum_average: 60,
    rule_maximum_aggregate: null,
    rule_minimum_subjects_passed: null,
    rule_minimum_attendance_percentage: 80,
    rule_required_subjects: {},
    rule_additional_configuration: {},
  });
  if (created.error) throw created.error;
  const newId = (created.data as Array<{ entity_id: string }>)[0]?.entity_id;
  if (!newId) throw new Error("Rule version creation returned no id");
  const activated = await fixture.admin.rpc("activate_promotion_rule", {
    target_rule_id: newId,
    expected_updated_at: (created.data as Array<{ updated_at: string }>)[0]
      .updated_at,
  });
  if (activated.error) throw activated.error;
}

export async function insertLastSeatOccupants(
  fixture: RaceFixture,
  count = 199,
) {
  const existing = Number(
    (
      await fixture.db.query(
        "select count(*)::int as count from public.enrollments where class_section_id=$1 and status in ('ACTIVE','REPEATING')",
        [fixture.ids.targetClass],
      )
    ).rows[0].count,
  );
  for (let index = 0; index < count; index += 1) {
    const studentId = randomUUID();
    const enrollmentId = randomUUID();
    await fixture.db.query(
      "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date,status) values($1,$2,$3,'Seat','Occupant','2050-01-01','ACTIVE')",
      [studentId, fixture.ids.school, `SEAT-${studentId.slice(0, 8)}`],
    );
    await fixture.db.query(
      "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,status,enrolled_on) values($1,$2,$3,$4,'ACTIVE','2050-01-01')",
      [enrollmentId, studentId, fixture.ids.nextYear, fixture.ids.targetClass],
    );
  }
  await fixture.db.query(
    "update public.class_sections set capacity=$2 where id=$1",
    [fixture.ids.targetClass, existing + count + 1],
  );
}
