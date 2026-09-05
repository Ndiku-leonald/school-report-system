import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL;
for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  SUPABASE_LOCAL_DB_URL: databaseUrl,
})) {
  if (!value)
    throw new Error(`${name} is required for promotion integration tests.`);
}

const password = "synthetic-stage-seventeen-promotion-password";
const admin = createClient(url!, serviceKey!, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});
const db = new Client({ connectionString: databaseUrl! });
const ids = Object.fromEntries(
  [
    "school",
    "otherSchool",
    "year",
    "nextYear",
    "closedYear",
    "term",
    "otherTerm",
    "grade",
    "nextGrade",
    "finalGrade",
    "sourceClass",
    "targetClass",
    "finalClass",
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
    "otherDecision",
    "otherStudent",
    "otherEnrollment",
  ].map((key) => [key, randomUUID()]),
) as Record<string, string>;

type Actor = {
  email: string;
  userId: string;
  membershipId: string;
  role: string;
};
const actors: Actor[] = [];
const students: string[] = [];
const enrollments: string[] = [];
let schoolAdmin: Actor;
let headTeacher: Actor;
let registrar: Actor;
let classTeacher: Actor;
let adminClient: SupabaseClient;
let headClient: SupabaseClient;
let registrarClient: SupabaseClient;
let classClient: SupabaseClient;
let runId = "";
let decisions: Array<{
  decision_id: string;
  decision_version: number;
  enrollment_id: string;
}> = [];

async function query(text: string, values: unknown[] = []) {
  return db.query(text, values);
}

async function actor(
  label: string,
  role: string,
  schoolId = ids.school,
  status = "ACTIVE",
) {
  const email = `promotion.integration.${label}.${Date.now()}.${randomUUID()}@example.invalid`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const membershipId = randomUUID();
  await query(
    "insert into public.profiles(id,first_name,last_name) values($1,$2,'Promotion')",
    [created.data.user.id, label],
  );
  await query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,$5)",
    [
      membershipId,
      schoolId,
      created.data.user.id,
      `PR-${randomUUID()}`,
      status,
    ],
  );
  await query(
    "insert into public.staff_role_assignments(id,membership_id,role,granted_at) values($1,$2,$3,now()-interval '1 day')",
    [randomUUID(), membershipId, role],
  );
  const value = { email, userId: created.data.user.id, membershipId, role };
  actors.push(value);
  return value;
}

async function signIn(value: Actor) {
  const client = createClient(url!, anonKey!, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const login = await client.auth.signInWithPassword({
    email: value.email,
    password,
  });
  if (login.error) throw login.error;
  const selected = await client.rpc("set_my_active_membership", {
    target_membership_id: value.membershipId,
  });
  if (selected.error) throw selected.error;
  return client;
}

async function rpc<T = unknown>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
) {
  const result = await client.rpc(name, args);
  return result as {
    data: T;
    error: { message: string; code?: string } | null;
  };
}

async function expectError(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
  pattern: RegExp,
) {
  const result = await rpc(client, name, args);
  expect(result.error?.message ?? "", `${name} must reject`).toMatch(pattern);
}

async function setup() {
  await db.connect();
  await query(
    "insert into public.schools(id,name,slug,school_code) values($1,'Promotion Integration School',$2,'PROMO-A'),($3,'Promotion Other School',$4,'PROMO-B')",
    [
      ids.school,
      `promotion-integration-${Date.now()}`,
      ids.otherSchool,
      `promotion-other-${Date.now()}`,
    ],
  );
  schoolAdmin = await actor("school-admin", "SCHOOL_ADMIN");
  headTeacher = await actor("head-teacher", "HEAD_TEACHER");
  registrar = await actor("registrar", "ACADEMIC_REGISTRAR");
  classTeacher = await actor("class-teacher", "CLASS_TEACHER");
  await actor("suspended", "SCHOOL_ADMIN", ids.school, "SUSPENDED");
  await actor("other-school-admin", "SCHOOL_ADMIN", ids.otherSchool);

  await query(
    "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,'Promotion Source','2046-01-01','2046-12-31','ACTIVE'),($3,$2,'Promotion Next','2047-01-01','2047-12-31','DRAFT'),($4,$2,'Promotion Closed','2048-01-01','2048-12-31','CLOSED')",
    [ids.year, ids.school, ids.nextYear, ids.closedYear],
  );
  await query(
    "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status,is_promotion_term) values($1,$2,'Promotion Term',1,'2046-01-01','2046-06-30','MARKS_ENTRY',true),($3,$2,'Non Promotion Term',2,'2046-07-01','2046-12-31','LOCKED',false)",
    [ids.term, ids.year, ids.otherTerm],
  );
  await query(
    "insert into public.grade_levels(id,school_id,code,name,sort_order,is_final_grade) values($1,$2,'P1','Promotion Source Grade',1,false),($3,$2,'P2','Promotion Target Grade',2,false),($4,$2,'P7','Promotion Final Grade',7,true)",
    [ids.grade, ids.school, ids.nextGrade, ids.finalGrade],
  );
  await query(
    "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code,capacity) values($1,$2,$3,'Promotion Source Class','P1-A',200),($4,$5,$6,'Promotion Target Class','P2-A',200),($7,$8,$9,'Promotion Final Class','P7-A',200)",
    [
      ids.sourceClass,
      ids.year,
      ids.grade,
      ids.targetClass,
      ids.nextYear,
      ids.nextGrade,
      ids.finalClass,
      ids.nextYear,
      ids.finalGrade,
    ],
  );
  await query(
    "insert into public.subjects(id,school_id,code,name,sort_order,is_core) values($1,$2,'PROMO-SUB','Promotion Subject',1,true)",
    [ids.subject, ids.school],
  );
  await query(
    "insert into public.grade_level_subjects(id,grade_level_id,subject_id,is_required,contributes_to_aggregate,sort_order) values($1,$2,$3,true,true,1)",
    [ids.mapping, ids.grade, ids.subject],
  );

  for (let index = 0; index < 78; index += 1) {
    const studentId = randomUUID();
    const enrollmentId = randomUUID();
    students.push(studentId);
    enrollments.push(enrollmentId);
    await query(
      "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date,date_of_birth,status) values($1,$2,$3,$4,'Learner','2046-01-02','2036-01-02','ACTIVE')",
      [
        studentId,
        ids.school,
        `PROMO-${String(index).padStart(3, "0")}`,
        `Learner${index}`,
      ],
    );
    await query(
      "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,status,enrolled_on) values($1,$2,$3,$4,'ACTIVE','2046-01-02')",
      [enrollmentId, studentId, ids.year, ids.sourceClass],
    );
  }
  await query(
    "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date,status) values($1,$2,'PROMO-INACTIVE','Inactive','Learner','2046-01-02','INACTIVE')",
    [ids.otherStudent, ids.school],
  );
  await query(
    "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,status,enrolled_on) values($1,$2,$3,$4,'ACTIVE','2046-01-02')",
    [ids.otherEnrollment, ids.otherStudent, ids.year, ids.sourceClass],
  );

  await query(
    "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,'2046-01-02')",
    [
      ids.assignment,
      ids.term,
      ids.sourceClass,
      ids.subject,
      schoolAdmin.membershipId,
    ],
  );
  await query(
    "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,status,effective_from,created_by) values($1,$2,$3,$4,'Promotion Scheme','DRAFT','2046-01-02',$5)",
    [ids.scheme, ids.term, ids.grade, ids.subject, schoolAdmin.membershipId],
  );
  await query(
    "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values($1,$2,'Promotion Exam','PROMO-EXAM',100,100,1)",
    [ids.component, ids.scheme],
  );
  await query(
    "update public.assessment_schemes set status='ACTIVE' where id=$1",
    [ids.scheme],
  );
  await query(
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
  for (const enrollmentId of enrollments) {
    await query(
      "insert into public.marks(mark_sheet_id,assessment_component_id,enrollment_id,score,attendance_status,created_by,updated_by) values($1,$2,$3,90,'PRESENT',$4,$4)",
      [ids.sheet, ids.component, enrollmentId, schoolAdmin.membershipId],
    );
    await query(
      "insert into public.term_attendance(term_id,enrollment_id,days_open,days_present,days_absent,recorded_by) values($1,$2,100,90,10,$3)",
      [ids.term, enrollmentId, schoolAdmin.membershipId],
    );
  }
  await query(
    "insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,effective_from,created_by) values($1,$2,$3,$4,'Promotion Scale',1,true,'2046-01-02',$5)",
    [ids.scale, ids.school, ids.year, ids.grade, schoolAdmin.membershipId],
  );
  await query(
    "insert into public.grading_bands(grading_scale_id,minimum_score,maximum_score,grade,aggregate_points,is_pass,sort_order) values($1,0,50,'F',1,false,1),($1,50,100,'A',5,true,2)",
    [ids.scale],
  );
  await query(
    "insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,version,ranking_basis,tie_method,configuration,is_active,created_by) values($1,$2,$3,$4,'Promotion Ranking',1,'AVERAGE','DENSE',$5,true,$6)",
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
      schoolAdmin.membershipId,
    ],
  );
  await query(
    "insert into public.aggregate_classification_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,created_by) values($1,$2,$3,$4,'Promotion Classification',1,true,$5)",
    [
      ids.classification,
      ids.school,
      ids.year,
      ids.grade,
      schoolAdmin.membershipId,
    ],
  );
  await query(
    "insert into public.aggregate_classification_bands(scale_id,minimum_aggregate,maximum_aggregate,label,sort_order) values($1,0,5,'Ready',1)",
    [ids.classification],
  );
  await query(
    "select set_config('app.marks_workflow_transition','allowed',false)",
  );
  await query(
    "update public.mark_sheets set workflow_status='LOCKED',locked_by=$2,locked_at=now() where id=$1",
    [ids.sheet, schoolAdmin.membershipId],
  );
  await query(
    "select set_config('app.term_marks_workflow_transition','allowed',false)",
  );
  await query("update public.terms set status='LOCKED' where id=$1", [
    ids.term,
  ]);
  await query(
    "insert into public.promotion_rules(id,school_id,academic_year_id,grade_level_id,name,version,minimum_average,minimum_attendance_percentage,required_subject_rules,additional_rules,is_active,created_by) values($1,$2,$3,$4,'Promotion Acceptance Rule',1,50,80,'{}','{}',true,$5)",
    [ids.rule, ids.school, ids.year, ids.grade, schoolAdmin.membershipId],
  );

  adminClient = await signIn(schoolAdmin);
  headClient = await signIn(headTeacher);
  registrarClient = await signIn(registrar);
  classClient = await signIn(classTeacher);
  const calculated = await adminClient.rpc("calculate_grade_results", {
    target_term_id: ids.term,
    target_grade_level_id: ids.grade,
    target_grading_scale_id: ids.scale,
    target_ranking_rule_id: ids.ranking,
    target_aggregate_classification_scale_id: ids.classification,
  });
  if (calculated.error) throw calculated.error;
  runId =
    (calculated.data as Array<{ calculation_run_id: string }>)[0]
      ?.calculation_run_id ?? "";
  if (!runId)
    throw new Error("The real Stage 11 calculation run was not created.");
  const generated = await rpc(
    adminClient,
    "generate_promotion_recommendations",
    { target_term_id: ids.term, target_grade_level_id: ids.grade },
  );
  if (generated.error) throw generated.error;
  decisions = (
    generated.data as Array<{
      decision_id: string;
      decision_version: number;
      enrollment_id: string;
    }>
  ).filter((row) => row.enrollment_id !== ids.otherEnrollment);
  if (decisions.length < 70)
    throw new Error(
      `Expected at least 70 real promotion decisions, received ${decisions.length}.`,
    );
}

async function cleanup() {
  // Promotion snapshots and histories are append-only by design. Leave the
  // synthetic evidence fixture in the local database rather than bypassing
  // those lifecycle protections during teardown.
  await db.end();
  return;
  for (const value of actors) await admin.auth.admin.deleteUser(value.userId);
  await query("delete from public.student_progressions where school_id=$1", [
    ids.school,
  ]);
  await query(
    "delete from public.promotion_decisions where enrollment_id in (select id from public.enrollments where academic_year_id=$1)",
    [ids.year],
  );
  await query(
    "delete from public.promotion_recommendation_snapshots where school_id=$1",
    [ids.school],
  );
  await query("delete from public.term_attendance where term_id=$1", [
    ids.term,
  ]);
  await query(
    "delete from public.calculated_subject_results where calculation_run_id=$1",
    [runId],
  );
  await query(
    "delete from public.calculated_student_results where calculation_run_id=$1",
    [runId],
  );
  await query(
    "delete from public.calculated_component_explanations where calculation_run_id=$1",
    [runId],
  );
  await query(
    "delete from public.calculated_subject_performance where calculation_run_id=$1",
    [runId],
  );
  await query(
    "delete from public.result_calculation_sources where calculation_run_id=$1",
    [runId],
  );
  await query("delete from public.result_calculation_runs where id=$1", [
    runId,
  ]);
  await query("delete from public.marks where mark_sheet_id=$1", [ids.sheet]);
  await query("delete from public.mark_sheets where id=$1", [ids.sheet]);
  await query("delete from public.assessment_components where id=$1", [
    ids.component,
  ]);
  await query("delete from public.assessment_schemes where id=$1", [
    ids.scheme,
  ]);
  await query("delete from public.teaching_assignments where id=$1", [
    ids.assignment,
  ]);
  await query("delete from public.promotion_rules where id=$1", [ids.rule]);
  await query("delete from public.grading_bands where grading_scale_id=$1", [
    ids.scale,
  ]);
  await query("delete from public.grading_scales where id=$1", [ids.scale]);
  await query("delete from public.ranking_rules where id=$1", [ids.ranking]);
  await query(
    "delete from public.aggregate_classification_bands where scale_id=$1",
    [ids.classification],
  );
  await query(
    "delete from public.aggregate_classification_scales where id=$1",
    [ids.classification],
  );
  await query(
    "delete from public.enrollments where academic_year_id in ($1,$2)",
    [ids.year, ids.nextYear],
  );
  await query("delete from public.students where school_id in ($1,$2)", [
    ids.school,
    ids.otherSchool,
  ]);
  await query(
    "delete from public.class_sections where academic_year_id in ($1,$2)",
    [ids.year, ids.nextYear],
  );
  await query("delete from public.grade_level_subjects where id=$1", [
    ids.mapping,
  ]);
  await query("delete from public.subjects where id=$1", [ids.subject]);
  await query("delete from public.grade_levels where school_id=$1", [
    ids.school,
  ]);
  await query("delete from public.terms where academic_year_id=$1", [ids.year]);
  await query("delete from public.academic_years where school_id=$1", [
    ids.school,
  ]);
  await query("delete from public.schools where id in ($1,$2)", [
    ids.school,
    ids.otherSchool,
  ]);
  await db.end();
}

describe.sequential("Stage 17 promotion acceptance integration", () => {
  beforeAll(setup);
  afterAll(cleanup);

  it("01. uses a real locked Stage 11 run", async () => {
    const row = (
      await query(
        "select id,version from public.result_calculation_runs where id=$1",
        [runId],
      )
    ).rows[0];
    expect(row.id).toBe(runId);
    expect(Number(row.version)).toBe(1);
  });
  it("02. generates an active learner population", () =>
    expect(decisions.length).toBeGreaterThanOrEqual(70));
  it("03. excludes inactive learners", async () =>
    expect(
      (
        await query(
          "select count(*) from public.promotion_decisions where enrollment_id=$1",
          [ids.otherEnrollment],
        )
      ).rows[0].count,
    ).toBe("0"));
  it("04. stores immutable snapshot evidence", async () =>
    expect(
      (
        await query(
          "select snapshot_data->>'calculation_run_id' as run,snapshot_checksum from public.promotion_recommendation_snapshots where enrollment_id=$1",
          [decisions[0].enrollment_id],
        )
      ).rows[0].run,
    ).toBe(runId));
  it("05. stores deterministic 64-character checksums", async () =>
    expect(
      (
        await query(
          "select snapshot_checksum from public.promotion_recommendation_snapshots where enrollment_id=$1",
          [decisions[0].enrollment_id],
        )
      ).rows[0].snapshot_checksum,
    ).toMatch(/^[a-f0-9]{64}$/));
  it("06. records positive attendance evidence", async () =>
    expect(
      (
        await query(
          "select snapshot_data->'attendance'->>'attendance_percentage' as pct from public.promotion_recommendation_snapshots where enrollment_id=$1",
          [decisions[0].enrollment_id],
        )
      ).rows[0].pct,
    ).toBe("90.00"));
  it("07. exposes current recommendation state", async () => {
    const result = await rpc(adminClient, "list_promotion_recommendations", {
      target_term_id: ids.term,
      target_grade_level_id: ids.grade,
    });
    expect(result.error).toBeNull();
    expect((result.data as Array<{ state: string }>)[0].state).toBe(
      "RECOMMENDED",
    );
  });
  it("08. exposes the active scope count", async () => {
    const result = await rpc(adminClient, "list_promotion_scopes");
    const row = (
      result.data as Array<{
        term_id: string;
        grade_level_id: string;
        learner_count: number;
      }>
    ).find(
      (item) => item.term_id === ids.term && item.grade_level_id === ids.grade,
    );
    expect(row?.learner_count).toBe(78);
  });
  it("09. reports the scope as current", async () => {
    const result = await rpc(adminClient, "list_promotion_scopes");
    expect(
      (
        result.data as Array<{
          term_id: string;
          grade_level_id: string;
          readiness_state: string;
        }>
      ).find(
        (item) =>
          item.term_id === ids.term && item.grade_level_id === ids.grade,
      )?.readiness_state,
    ).toBe("CURRENT");
  });
  it("10. returns a safe empty history before confirmation", async () => {
    const result = await rpc(adminClient, "list_promotion_decision_history", {
      target_enrollment_id_arg: decisions[0].enrollment_id,
    });
    expect(result.error).toBeNull();
    expect((result.data as unknown[]).length).toBe(1);
  });

  it("11. permits the head teacher to read recommendations", async () =>
    expect(
      (
        await rpc(headClient, "list_promotion_recommendations", {
          target_term_id: ids.term,
          target_grade_level_id: ids.grade,
        })
      ).error,
    ).toBeNull());
  it("12. permits the registrar to read recommendations", async () =>
    expect(
      (
        await rpc(registrarClient, "list_promotion_recommendations", {
          target_term_id: ids.term,
          target_grade_level_id: ids.grade,
        })
      ).error,
    ).toBeNull());
  it("13. denies a class teacher recommendation read", async () =>
    expectError(
      classClient,
      "list_promotion_recommendations",
      { target_term_id: ids.term, target_grade_level_id: ids.grade },
      /PROMOTION_FORBIDDEN|permission/i,
    ));
  it("14. denies a class teacher scope read", async () =>
    expectError(
      classClient,
      "list_promotion_scopes",
      {},
      /PROMOTION_FORBIDDEN|permission/i,
    ));
  it("15. denies a suspended membership", async () => {
    const suspended = actors.find(
      (item) =>
        item.role === "SCHOOL_ADMIN" && item.email.includes("suspended"),
    );
    expect(suspended).toBeTruthy();
    const client = await signIn(suspended!);
    await expectError(
      client,
      "list_promotion_scopes",
      {},
      /PROMOTION_FORBIDDEN|permission/i,
    );
  });
  it("16. denies a signed-out anonymous client", async () => {
    const anonymous = createClient(url!, anonKey!, {
      auth: { persistSession: false },
    });
    await expectError(
      anonymous,
      "list_promotion_scopes",
      {},
      /PROMOTION_FORBIDDEN|permission|JWT/i,
    );
  });
  it("17. prevents cross-school scope reads", async () => {
    const result = await rpc(adminClient, "list_promotion_recommendations", {
      target_term_id: ids.otherTerm,
      target_grade_level_id: ids.grade,
    });
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });
  it("18. prevents cross-school decision confirmation", async () => {
    await expectError(
      adminClient,
      "confirm_promotion_decision",
      {
        target_decision_id: ids.otherDecision,
        expected_decision_version: 1,
        target_final_decision: "PROMOTED",
      },
      /NOT_FOUND|FORBIDDEN/i,
    );
  });
  it("19. does not expose snapshots through direct table access", async () => {
    const result = await adminClient
      .from("promotion_recommendation_snapshots")
      .select("id");
    expect(result.error).toBeTruthy();
  });
  it("20. does not expose progressions through direct table access", async () => {
    const result = await adminClient.from("student_progressions").select("id");
    expect(result.error).toBeTruthy();
  });

  it("21. rejects an incorrect confirmation version", async () =>
    expectError(
      adminClient,
      "confirm_promotion_decision",
      {
        target_decision_id: decisions[1].decision_id,
        expected_decision_version: 99,
        target_final_decision: "PROMOTED",
      },
      /VERSION_CONFLICT/i,
    ));
  it("22. confirms a matching version", async () => {
    const result = await rpc(adminClient, "confirm_promotion_decision", {
      target_decision_id: decisions[1].decision_id,
      expected_decision_version: 1,
      target_final_decision: "PROMOTED",
    });
    expect(result.error).toBeNull();
  });
  it("23. rejects a second confirmation as immutable", async () =>
    expectError(
      adminClient,
      "confirm_promotion_decision",
      {
        target_decision_id: decisions[1].decision_id,
        expected_decision_version: 1,
        target_final_decision: "ACADEMIC_REVIEW",
      },
      /IMMUTABLE|VERSION_CONFLICT/i,
    ));
  it("24. requires a reason for an override", async () =>
    expectError(
      adminClient,
      "confirm_promotion_decision",
      {
        target_decision_id: decisions[2].decision_id,
        expected_decision_version: 1,
        target_final_decision: "REPEAT_CONFIRMED",
      },
      /OVERRIDE_REASON_REQUIRED/i,
    ));
  it("25. records an override reason", async () => {
    const result = await rpc(adminClient, "confirm_promotion_decision", {
      target_decision_id: decisions[2].decision_id,
      expected_decision_version: 1,
      target_final_decision: "REPEAT_CONFIRMED",
      decision_reason: "Documented support review",
    });
    expect(result.error).toBeNull();
  });
  it("26. permits head teacher confirmation", async () => {
    const result = await rpc(headClient, "confirm_promotion_decision", {
      target_decision_id: decisions[3].decision_id,
      expected_decision_version: 1,
      target_final_decision: "PROMOTED",
    });
    expect(result.error).toBeNull();
  });
  it("27. denies registrar confirmation", async () =>
    expectError(
      registrarClient,
      "confirm_promotion_decision",
      {
        target_decision_id: decisions[4].decision_id,
        expected_decision_version: 1,
        target_final_decision: "PROMOTED",
      },
      /FORBIDDEN|permission/i,
    ));
  it("28. denies class teacher confirmation", async () =>
    expectError(
      classClient,
      "confirm_promotion_decision",
      {
        target_decision_id: decisions[5].decision_id,
        expected_decision_version: 1,
        target_final_decision: "PROMOTED",
      },
      /FORBIDDEN|permission/i,
    ));
  it("29. confirms academic review as a terminal human outcome", async () => {
    const result = await rpc(adminClient, "confirm_promotion_decision", {
      target_decision_id: decisions[6].decision_id,
      expected_decision_version: 1,
      target_final_decision: "ACADEMIC_REVIEW",
    });
    expect(result.error).toBeNull();
  });
  it("30. blocks progression for academic review", async () =>
    expectError(
      adminClient,
      "apply_student_progression",
      {
        target_decision_id: decisions[6].decision_id,
        expected_decision_version: 1,
        target_academic_year_id: null,
        target_class_section_id: null,
      },
      /OUTCOME_INVALID/i,
    ));
  it("31. confirms a supported promotion", async () => {
    const result = await rpc(adminClient, "confirm_promotion_decision", {
      target_decision_id: decisions[7].decision_id,
      expected_decision_version: 1,
      target_final_decision: "PROMOTED_WITH_SUPPORT",
    });
    expect(result.error).toBeNull();
  });
  it("32. rejects unsupported final outcomes", async () =>
    expectError(
      adminClient,
      "confirm_promotion_decision",
      {
        target_decision_id: decisions[8].decision_id,
        expected_decision_version: 1,
        target_final_decision: "TRANSFERRED",
      },
      /OUTCOME_INVALID/i,
    ));
  it("33. returns confirmed state", async () => {
    const result = await rpc(adminClient, "list_promotion_recommendations", {
      target_term_id: ids.term,
      target_grade_level_id: ids.grade,
    });
    const row = (
      result.data as Array<{ decision_id: string; state: string }>
    ).find((item) => item.decision_id === decisions[1].decision_id);
    expect(row?.state).toBe("CONFIRMED");
  });
  it("34. exposes confirmation history", async () => {
    const result = await rpc(adminClient, "list_promotion_decision_history", {
      target_enrollment_id_arg: decisions[1].enrollment_id,
    });
    expect(
      (result.data as Array<{ final_decision: string }>)[0].final_decision,
    ).toBe("PROMOTED");
  });
  it("35. rejects reopen without a reason", async () =>
    expectError(
      adminClient,
      "reopen_promotion_decision",
      {
        target_decision_id: decisions[1].decision_id,
        expected_decision_version: 1,
        reopen_reason: "",
      },
      /REASON_REQUIRED/i,
    ));
  it("36. reopens into a new version", async () => {
    const result = await rpc(adminClient, "reopen_promotion_decision", {
      target_decision_id: decisions[1].decision_id,
      expected_decision_version: 1,
      reopen_reason: "Correction requested",
    });
    expect(result.error).toBeNull();
    expect(
      (result.data as Array<{ decision_version: number }>)[0].decision_version,
    ).toBe(2);
    decisions[1] = {
      ...decisions[1],
      decision_id: (result.data as Array<{ decision_id: string }>)[0]
        .decision_id,
      decision_version: 2,
    };
  });
  it("37. rejects stale reopen versions", async () =>
    expectError(
      adminClient,
      "reopen_promotion_decision",
      {
        target_decision_id: decisions[1].decision_id,
        expected_decision_version: 1,
        reopen_reason: "Second correction",
      },
      /VERSION_CONFLICT|REQUIRES_CONFIRMED/i,
    ));
  it("38. regenerates an open decision idempotently", async () => {
    const result = await rpc(
      adminClient,
      "generate_promotion_recommendations",
      { target_term_id: ids.term, target_grade_level_id: ids.grade },
    );
    expect(result.error).toBeNull();
  });
  it("39. refuses a non-promotion term", async () =>
    expectError(
      adminClient,
      "generate_promotion_recommendations",
      { target_term_id: ids.otherTerm, target_grade_level_id: ids.grade },
      /TERM_REQUIRED/i,
    ));
  it("40. keeps generation independent from calculation", async () => {
    const result = await rpc(
      adminClient,
      "generate_promotion_recommendations",
      { target_term_id: ids.term, target_grade_level_id: ids.grade },
    );
    expect(result.error).toBeNull();
    expect(
      (result.data as Array<{ decision_id: string }>).length,
    ).toBeGreaterThan(0);
  });

  it("41. applies a promoted learner", async () => {
    const result = await rpc(adminClient, "apply_student_progression", {
      target_decision_id: decisions[1].decision_id,
      expected_decision_version: decisions[1].decision_version,
      target_academic_year_id: ids.nextYear,
      target_class_section_id: ids.targetClass,
    });
    expect(result.error).toBeNull();
  });
  it("42. returns the exact progression on retry", async () => {
    const result = await rpc(adminClient, "apply_student_progression", {
      target_decision_id: decisions[1].decision_id,
      expected_decision_version: decisions[1].decision_version,
      target_academic_year_id: ids.nextYear,
      target_class_section_id: ids.targetClass,
    });
    expect(result.error).toBeNull();
    expect((result.data as Array<{ idempotent: boolean }>)[0].idempotent).toBe(
      true,
    );
  });
  it("43. rejects a conflicting idempotent retry", async () =>
    expectError(
      adminClient,
      "apply_student_progression",
      {
        target_decision_id: decisions[1].decision_id,
        expected_decision_version: decisions[1].decision_version,
        target_academic_year_id: ids.nextYear,
        target_class_section_id: ids.finalClass,
      },
      /RETRY_CONFLICT/i,
    ));
  it("44. persists the application snapshot", async () => {
    const row = (
      await query(
        "select application_snapshot,application_checksum from public.student_progressions where source_decision_id=$1",
        [decisions[1].decision_id],
      )
    ).rows[0];
    expect(row.application_snapshot).toBeTruthy();
    expect(row.application_checksum).toMatch(/^[a-f0-9]{64}$/);
  });
  it("45. records deterministic source exit date", async () => {
    const row = (
      await query("select exited_on from public.enrollments where id=$1", [
        decisions[1].enrollment_id,
      ])
    ).rows[0];
    expect(String(row.exited_on)).toContain("2046-12-31");
  });
  it("46. creates an active target enrollment", async () => {
    const row = (
      await query(
        "select status,academic_year_id from public.enrollments where student_id=$1 and academic_year_id=$2",
        [students[1], ids.nextYear],
      )
    ).rows[0];
    expect(row.status).toBe("ACTIVE");
    expect(row.academic_year_id).toBe(ids.nextYear);
  });
  it("47. keeps the learner active after promotion", async () =>
    expect(
      (
        await query("select status from public.students where id=$1", [
          students[1],
        ])
      ).rows[0].status,
    ).toBe("ACTIVE"));
  it("48. rejects a progression version conflict", async () =>
    expectError(
      adminClient,
      "apply_student_progression",
      {
        target_decision_id: decisions[1].decision_id,
        expected_decision_version: 99,
        target_academic_year_id: ids.nextYear,
        target_class_section_id: ids.targetClass,
      },
      /VERSION_CONFLICT/i,
    ));
  it("49. requires confirmation before application", async () =>
    expectError(
      adminClient,
      "apply_student_progression",
      {
        target_decision_id: decisions[9].decision_id,
        expected_decision_version: 1,
        target_academic_year_id: ids.nextYear,
        target_class_section_id: ids.targetClass,
      },
      /CONFIRMATION_REQUIRED/i,
    ));
  it("50. exposes progression fingerprint", async () => {
    const result = await rpc(adminClient, "list_promotion_recommendations", {
      target_term_id: ids.term,
      target_grade_level_id: ids.grade,
    });
    const row = (
      result.data as Array<{
        decision_id: string;
        progression_application_checksum: string | null;
      }>
    ).find((item) => item.decision_id === decisions[1].decision_id);
    expect(row?.progression_application_checksum).toMatch(/^[a-f0-9]{64}$/);
  });
  it("51. blocks academic-review progression in the browser-facing reader", async () => {
    const result = await rpc(adminClient, "list_promotion_target_classes", {
      target_decision_id: decisions[6].decision_id,
    });
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });
  it("52. returns only the immediate eligible target year", async () => {
    const result = await rpc(adminClient, "list_promotion_target_classes", {
      target_decision_id: decisions[7].decision_id,
    });
    expect(result.error).toBeNull();
    expect(
      (result.data as Array<{ academic_year_id: string }>).every(
        (row) => row.academic_year_id === ids.nextYear,
      ),
    ).toBe(true);
  });
  it("53. returns only active target classes", async () => {
    const result = await rpc(adminClient, "list_promotion_target_classes", {
      target_decision_id: decisions[7].decision_id,
    });
    expect(
      (result.data as Array<{ class_section_id: string }>).every(
        (row) => row.class_section_id === ids.targetClass,
      ),
    ).toBe(true);
  });
  it("54. preserves one source decision per progression", async () =>
    expect(
      (
        await query(
          "select count(*) from public.student_progressions where source_decision_id=$1",
          [decisions[1].decision_id],
        )
      ).rows[0].count,
    ).toBe("1"));
  it("55. does not resurrect a completed source enrollment", async () =>
    expect(
      (
        await query("select status from public.enrollments where id=$1", [
          decisions[1].enrollment_id,
        ])
      ).rows[0].status,
    ).toBe("COMPLETED"));
  it("56. keeps generated recommendations scoped to the school", async () => {
    const result = await rpc(adminClient, "list_promotion_recommendations", {
      target_term_id: ids.term,
      target_grade_level_id: ids.grade,
    });
    expect(
      (result.data as Array<{ enrollment_id: string }>).every((row) =>
        enrollments.includes(row.enrollment_id),
      ),
    ).toBe(true);
  });
  it("57. fails closed when attendance is zero-day", async () => {
    const enrollment = enrollments[70];
    await query(
      "update public.term_attendance set days_open=0,days_present=0,days_absent=0 where term_id=$1 and enrollment_id=$2",
      [ids.term, enrollment],
    );
    const result = await rpc(
      adminClient,
      "generate_promotion_recommendations",
      { target_term_id: ids.term, target_grade_level_id: ids.grade },
    );
    expect(result.error).toBeNull();
    const row = (
      result.data as Array<{
        enrollment_id: string;
        system_recommendation: string;
      }>
    ).find((item) => item.enrollment_id === enrollment);
    expect(row?.system_recommendation).toBe("ACADEMIC_REVIEW");
  });
  it("58. stores null attendance percentage for zero-day evidence", async () =>
    expect(
      (
        await query(
          "select snapshot_data->'attendance'->>'attendance_percentage' as pct from public.promotion_recommendation_snapshots where enrollment_id=$1 order by created_at desc limit 1",
          [enrollments[70]],
        )
      ).rows[0].pct,
    ).toBeNull());
  it("59. fails closed when attendance is missing", async () => {
    await query(
      "delete from public.term_attendance where term_id=$1 and enrollment_id=$2",
      [ids.term, enrollments[71]],
    );
    const result = await rpc(
      adminClient,
      "generate_promotion_recommendations",
      { target_term_id: ids.term, target_grade_level_id: ids.grade },
    );
    expect(result.error).toBeNull();
    const row = (
      result.data as Array<{
        enrollment_id: string;
        system_recommendation: string;
      }>
    ).find((item) => item.enrollment_id === enrollments[71]);
    expect(row?.system_recommendation).toBe("ACADEMIC_REVIEW");
  });
  it("60. retains explicit rule defaults for an empty object", async () => {
    const row = (
      await query(
        "select * from internal.promotion_additional_rule_values((select promotion_rules from public.promotion_rules where id=$1))",
        [ids.rule],
      )
    ).rows[0];
    expect(row.require_complete_result).toBe(true);
    expect(row.failure_outcome).toBe("ACADEMIC_REVIEW");
  });
  it("61. rejects obsolete additional rule keys", async () => {
    const result = await query(
      "select internal.validate_promotion_additional_rules(jsonb_populate_record((select promotion_rules from public.promotion_rules where id=$1), jsonb_build_object('additional_rules', jsonb_build_object('allow_manual_review',true)))) as valid",
      [ids.rule],
    );
    expect(result.rows[0].valid).toBe(false);
  });
  it("62. preserves active enrollment population semantics", async () => {
    await query(
      "update public.enrollments set status='WITHDRAWN',exited_on='2046-12-31' where id=$1",
      [enrollments[72]],
    );
    const result = await rpc(adminClient, "list_promotion_scopes");
    const row = (
      result.data as Array<{
        term_id: string;
        grade_level_id: string;
        learner_count: number;
      }>
    ).find(
      (item) => item.term_id === ids.term && item.grade_level_id === ids.grade,
    );
    expect(row?.learner_count).toBe(77);
  });
  it("63. excludes withdrawn learners from new generation", async () => {
    const result = await rpc(
      adminClient,
      "generate_promotion_recommendations",
      { target_term_id: ids.term, target_grade_level_id: ids.grade },
    );
    expect(
      (result.data as Array<{ enrollment_id: string }>).some(
        (row) => row.enrollment_id === enrollments[72],
      ),
    ).toBe(false);
  });
  it("64. keeps a confirmed source visible as stale after evidence change", async () => {
    await confirm(22);
    await query(
      "update public.term_attendance set days_present=80,days_absent=20 where term_id=$1 and enrollment_id=$2",
      [ids.term, enrollments[22]],
    );
    const result = await rpc(adminClient, "list_promotion_recommendations", {
      target_term_id: ids.term,
      target_grade_level_id: ids.grade,
    });
    const row = (
      result.data as Array<{ decision_id: string; state: string }>
    ).find((item) => item.decision_id === decisions[22].decision_id);
    expect(row?.state).toBe("CONFIRMED_STALE");
  });
  it("65. does not silently supersede a confirmed decision", async () =>
    expect(
      (
        await query(
          "select count(*) from public.promotion_decisions where enrollment_id=$1",
          [decisions[22].enrollment_id],
        )
      ).rows[0].count,
    ).toBe("1"));
  it("66. keeps decision history ordered by version", async () => {
    const result = await rpc(adminClient, "list_promotion_decision_history", {
      target_enrollment_id_arg: decisions[1].enrollment_id,
    });
    const versions = (result.data as Array<{ version: number }>).map(
      (row) => row.version,
    );
    expect(versions).toEqual([1, 2]);
  });
  it("67. retains old decision rows as history", async () =>
    expect(
      (
        await query(
          "select superseded_by from public.promotion_decisions where enrollment_id=$1 and version=1",
          [decisions[1].enrollment_id],
        )
      ).rows[0].superseded_by,
    ).toBeTruthy());
  it("68. has exactly one current decision", async () =>
    expect(
      (
        await query(
          "select count(*) from public.promotion_decisions where enrollment_id=$1 and superseded_by is null",
          [decisions[1].enrollment_id],
        )
      ).rows[0].count,
    ).toBe("1"));
  it("69. rejects direct decision source mutation", async () => {
    await expect(
      query(
        "update public.promotion_decisions set system_recommendation='ACADEMIC_REVIEW' where id=$1",
        [decisions[1].decision_id],
      ),
    ).rejects.toThrow(/IMMUTABLE/);
  });
  it("70. rejects direct progression mutation", async () => {
    await expect(
      query(
        "update public.student_progressions set outcome='ACADEMIC_REVIEW' where source_decision_id=$1",
        [decisions[1].decision_id],
      ),
    ).rejects.toThrow();
  });
  it("71. rejects direct snapshot mutation", async () => {
    await expect(
      query(
        "update public.promotion_recommendation_snapshots set snapshot_checksum=repeat('0',64) where enrollment_id=$1",
        [decisions[1].enrollment_id],
      ),
    ).rejects.toThrow();
  });
  it("72. reports a single current Stage 11 run", async () =>
    expect(
      (
        await query(
          "select count(*) from public.result_calculation_runs where term_id=$1 and grade_level_id=$2",
          [ids.term, ids.grade],
        )
      ).rows[0].count,
    ).toBe("1"));
  it("73. does not calculate results during recommendation generation", async () => {
    const before = (
      await query(
        "select count(*) from public.result_calculation_runs where term_id=$1 and grade_level_id=$2",
        [ids.term, ids.grade],
      )
    ).rows[0].count;
    await rpc(adminClient, "generate_promotion_recommendations", {
      target_term_id: ids.term,
      target_grade_level_id: ids.grade,
    });
    const after = (
      await query(
        "select count(*) from public.result_calculation_runs where term_id=$1 and grade_level_id=$2",
        [ids.term, ids.grade],
      )
    ).rows[0].count;
    expect(after).toBe(before);
  });
  it("74. keeps public promotion tables non-writable", async () => {
    const result = await adminClient.from("student_progressions").insert({
      school_id: ids.school,
      source_decision_id: decisions[9].decision_id,
      source_enrollment_id: decisions[9].enrollment_id,
      outcome: "ACADEMIC_REVIEW",
      application_checksum: "0".repeat(64),
    });
    expect(result.error).toBeTruthy();
  });
  it("75. retains only supported recommendation outcomes", async () => {
    const result = await query(
      "select count(*) from public.promotion_decisions where system_recommendation not in ('PROMOTED','PROMOTED_WITH_SUPPORT','ACADEMIC_REVIEW','REPEAT_RECOMMENDED','COMPLETED')",
    );
    expect(result.rows[0].count).toBe("0");
  });

  describe.sequential("concurrency acceptance races", () => {
    async function clients() {
      return Promise.all([signIn(schoolAdmin), signIn(headTeacher)]);
    }
    async function confirm(index: number, outcome = "PROMOTED") {
      const value = decisions[index];
      const result = await rpc(adminClient, "confirm_promotion_decision", {
        target_decision_id: value.decision_id,
        expected_decision_version: value.decision_version,
        target_final_decision: outcome,
      });
      if (result.error) throw new Error(result.error.message);
    }
    async function race(left: Promise<unknown>, right: Promise<unknown>) {
      return Promise.allSettled([left, right]);
    }
    async function revokePromotionConfirmWhileRunning() {
      const connection = new Client({ connectionString: databaseUrl! });
      await connection.connect();
      const original = await connection.query(
        "select permission::text from public.role_permissions where role='SCHOOL_ADMIN' and permission='PROMOTION_CONFIRM'",
      );
      try {
        await connection.query(
          "delete from public.role_permissions where role='SCHOOL_ADMIN' and permission='PROMOTION_CONFIRM'",
        );
      } finally {
        for (const row of original.rows) {
          await connection.query(
            "insert into public.role_permissions(role,permission) values('SCHOOL_ADMIN',$1)",
            [row.permission],
          );
        }
        await connection.end();
      }
    }

    it("C01. double generation has one current row", async () => {
      const [left, right] = await clients();
      await race(
        rpc(left, "generate_promotion_recommendations", {
          target_term_id: ids.term,
          target_grade_level_id: ids.grade,
        }),
        rpc(right, "generate_promotion_recommendations", {
          target_term_id: ids.term,
          target_grade_level_id: ids.grade,
        }),
      );
      expect(
        (
          await query(
            "select count(*) from public.promotion_decisions where enrollment_id=$1 and superseded_by is null",
            [decisions[10].enrollment_id],
          )
        ).rows[0].count,
      ).toBe("1");
    });
    it("C02. generation and reading never expose a partial scope", async () => {
      const [left, right] = await clients();
      const results = await race(
        rpc(left, "generate_promotion_recommendations", {
          target_term_id: ids.term,
          target_grade_level_id: ids.grade,
        }),
        rpc(right, "list_promotion_recommendations", {
          target_term_id: ids.term,
          target_grade_level_id: ids.grade,
        }),
      );
      expect(results.some((result) => result.status === "fulfilled")).toBe(
        true,
      );
    });
    it("C03. generation and confirmation preserve one current row", async () => {
      const [left, right] = await clients();
      const value = decisions[11];
      const results = await race(
        rpc(left, "generate_promotion_recommendations", {
          target_term_id: ids.term,
          target_grade_level_id: ids.grade,
        }),
        rpc(right, "confirm_promotion_decision", {
          target_decision_id: value.decision_id,
          expected_decision_version: value.decision_version,
          target_final_decision: "PROMOTED",
        }),
      );
      expect(results.length).toBe(2);
      expect(
        (
          await query(
            "select count(*) from public.promotion_decisions where enrollment_id=$1 and superseded_by is null",
            [value.enrollment_id],
          )
        ).rows[0].count,
      ).toBe("1");
    });
    it("C04. conflicting confirmations have one winner", async () => {
      const value = decisions[12];
      const [left, right] = await clients();
      const results = await race(
        rpc(left, "confirm_promotion_decision", {
          target_decision_id: value.decision_id,
          expected_decision_version: 1,
          target_final_decision: "PROMOTED",
        }),
        rpc(right, "confirm_promotion_decision", {
          target_decision_id: value.decision_id,
          expected_decision_version: 1,
          target_final_decision: "REPEAT_CONFIRMED",
          decision_reason: "Concurrency review",
        }),
      );
      expect(
        results.filter(
          (result) =>
            result.status === "fulfilled" &&
            !(result.value as { error?: unknown }).error,
        ).length,
      ).toBe(1);
    });
    it("C05. confirmation and refresh cannot silently overwrite a final decision", async () => {
      const value = decisions[13];
      const [left, right] = await clients();
      await race(
        rpc(left, "confirm_promotion_decision", {
          target_decision_id: value.decision_id,
          expected_decision_version: 1,
          target_final_decision: "PROMOTED",
        }),
        rpc(right, "generate_promotion_recommendations", {
          target_term_id: ids.term,
          target_grade_level_id: ids.grade,
        }),
      );
      expect(
        (
          await query(
            "select count(*) from public.promotion_decisions where enrollment_id=$1 and superseded_by is null",
            [value.enrollment_id],
          )
        ).rows[0].count,
      ).toBe("1");
    });
    it("C06. confirmation and permission revocation resolve through the actor check", async () => {
      const value = decisions[14];
      const [left] = await clients();
      const results = await race(
        rpc(left, "confirm_promotion_decision", {
          target_decision_id: value.decision_id,
          expected_decision_version: 1,
          target_final_decision: "PROMOTED",
        }),
        revokePromotionConfirmWhileRunning(),
      );
      expect(results.length).toBe(2);
    });
    it("C07. reopen and progression leave one legal lifecycle result", async () => {
      await confirm(15);
      const value = decisions[15];
      const [left, right] = await clients();
      const results = await race(
        rpc(left, "reopen_promotion_decision", {
          target_decision_id: value.decision_id,
          expected_decision_version: 1,
          reopen_reason: "Concurrency reopen",
        }),
        rpc(right, "apply_student_progression", {
          target_decision_id: value.decision_id,
          expected_decision_version: 1,
          target_academic_year_id: ids.nextYear,
          target_class_section_id: ids.targetClass,
        }),
      );
      expect(results.length).toBe(2);
      expect(
        Number(
          (
            await query(
              "select count(*) from public.student_progressions where source_decision_id=$1",
              [value.decision_id],
            )
          ).rows[0].count,
        ),
      ).toBeLessThanOrEqual(1);
    });
    it("C08. double progression is idempotent", async () => {
      await confirm(16);
      const value = decisions[16];
      const [left, right] = await clients();
      await race(
        rpc(left, "apply_student_progression", {
          target_decision_id: value.decision_id,
          expected_decision_version: 1,
          target_academic_year_id: ids.nextYear,
          target_class_section_id: ids.targetClass,
        }),
        rpc(right, "apply_student_progression", {
          target_decision_id: value.decision_id,
          expected_decision_version: 1,
          target_academic_year_id: ids.nextYear,
          target_class_section_id: ids.targetClass,
        }),
      );
      expect(
        (
          await query(
            "select count(*) from public.student_progressions where source_decision_id=$1",
            [value.decision_id],
          )
        ).rows[0].count,
      ).toBe("1");
    });
    it("C09. two last-seat applications cannot exceed capacity", async () => {
      await confirm(17);
      await confirm(18);
      await query("update public.class_sections set capacity=1 where id=$1", [
        ids.targetClass,
      ]);
      const [left, right] = await clients();
      await race(
        rpc(left, "apply_student_progression", {
          target_decision_id: decisions[17].decision_id,
          expected_decision_version: 1,
          target_academic_year_id: ids.nextYear,
          target_class_section_id: ids.targetClass,
        }),
        rpc(right, "apply_student_progression", {
          target_decision_id: decisions[18].decision_id,
          expected_decision_version: 1,
          target_academic_year_id: ids.nextYear,
          target_class_section_id: ids.targetClass,
        }),
      );
      expect(
        Number(
          (
            await query(
              "select count(*) from public.enrollments where class_section_id=$1 and status='ACTIVE'",
              [ids.targetClass],
            )
          ).rows[0].count,
        ),
      ).toBeLessThanOrEqual(1);
      await query("update public.class_sections set capacity=200 where id=$1", [
        ids.targetClass,
      ]);
    });
    it("C10. progression and lifecycle change never resurrect a withdrawn learner", async () => {
      await confirm(19);
      const value = decisions[19];
      const [left] = await clients();
      await race(
        rpc(left, "apply_student_progression", {
          target_decision_id: value.decision_id,
          expected_decision_version: 1,
          target_academic_year_id: ids.nextYear,
          target_class_section_id: ids.targetClass,
        }),
        query("update public.students set status='WITHDRAWN' where id=$1", [
          students[19],
        ]),
      );
      const row = (
        await query("select status from public.students where id=$1", [
          students[19],
        ])
      ).rows[0];
      expect(["ACTIVE", "WITHDRAWN"]).toContain(row.status);
      await query("update public.students set status='ACTIVE' where id=$1", [
        students[19],
      ]);
    });
    it("C11. progression and permission transition do not duplicate applications", async () => {
      await confirm(20);
      const value = decisions[20];
      const [left] = await clients();
      await race(
        rpc(left, "apply_student_progression", {
          target_decision_id: value.decision_id,
          expected_decision_version: 1,
          target_academic_year_id: ids.nextYear,
          target_class_section_id: ids.targetClass,
        }),
        revokePromotionConfirmWhileRunning(),
      );
      expect(
        Number(
          (
            await query(
              "select count(*) from public.student_progressions where source_decision_id=$1",
              [value.decision_id],
            )
          ).rows[0].count,
        ),
      ).toBeLessThanOrEqual(1);
    });
    it("C12. exact and conflicting retries have distinct outcomes", async () => {
      await confirm(21);
      const value = decisions[21];
      const first = await rpc(adminClient, "apply_student_progression", {
        target_decision_id: value.decision_id,
        expected_decision_version: 1,
        target_academic_year_id: ids.nextYear,
        target_class_section_id: ids.targetClass,
      });
      expect(first.error).toBeNull();
      const [left, right] = await clients();
      const results = await race(
        rpc(left, "apply_student_progression", {
          target_decision_id: value.decision_id,
          expected_decision_version: 1,
          target_academic_year_id: ids.nextYear,
          target_class_section_id: ids.targetClass,
        }),
        rpc(right, "apply_student_progression", {
          target_decision_id: value.decision_id,
          expected_decision_version: 1,
          target_academic_year_id: ids.nextYear,
          target_class_section_id: ids.finalClass,
        }),
      );
      expect(
        results.some(
          (result) =>
            result.status === "fulfilled" &&
            (
              result.value as { error?: { message?: string } }
            ).error?.message?.match(/RETRY_CONFLICT/),
        ),
      ).toBe(true);
    });
  });
});
