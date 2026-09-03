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
    throw new Error(`${name} is required for analytics integration tests.`);
}

const password = "synthetic-stage-sixteen-analytics-password";
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
    "schoolA",
    "schoolB",
    "yearA",
    "termA",
    "yearB",
    "termB",
    "gradeA",
    "gradeB",
    "gradeUnused",
    "gradeOther",
    "classA",
    "classB",
    "classOther",
    "subject",
    "mappingA",
    "assignment",
    "scheme",
    "component",
    "sheet",
    "scale",
    "rule",
    "classification",
    "run",
    "foreignRun",
    "student1",
    "student2",
    "student3",
    "student4",
    "student5",
    "enrollment1",
    "enrollment2",
    "enrollment3",
    "enrollment4",
    "enrollment5",
    "guardian",
    "studentGuardian",
    "credential",
  ].map((key) => [key, randomUUID()]),
) as Record<string, string>;

type Actor = {
  email: string;
  userId: string;
  membershipId: string;
  role: string;
};
const actors: Actor[] = [];
let reader: SupabaseClient;
let runId = "";
let multiBMembershipForCleanup = "";
type RpcRow = Record<string, unknown>;

async function query(text: string, values: unknown[] = []) {
  return db.query(text, values);
}

async function createActor(
  label: string,
  role: string,
  schoolId = ids.schoolA,
  status = "ACTIVE",
): Promise<Actor> {
  const email = `analytics.${label}.${Date.now()}@example.invalid`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const membershipId = randomUUID();
  await query(
    "insert into public.profiles(id,first_name,last_name) values($1,$2,'Analytics')",
    [created.data.user.id, label],
  );
  await query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,$5)",
    [
      membershipId,
      schoolId,
      created.data.user.id,
      `AN-${randomUUID()}`,
      status,
    ],
  );
  await query(
    "insert into public.staff_role_assignments(id,membership_id,role,granted_at) values($1,$2,$3,now()-interval '1 day')",
    [randomUUID(), membershipId, role],
  );
  const actor = { email, userId: created.data.user.id, membershipId, role };
  actors.push(actor);
  return actor;
}

async function signIn(actor: Actor) {
  const client = createClient(url!, anonKey!, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const login = await client.auth.signInWithPassword({
    email: actor.email,
    password,
  });
  if (login.error) throw login.error;
  const selected = await client.rpc("set_my_active_membership", {
    target_membership_id: actor.membershipId,
  });
  if (selected.error) throw selected.error;
  return client;
}

async function rows<T extends RpcRow = RpcRow>(
  client: SupabaseClient,
  name: string,
  args?: Record<string, unknown>,
) {
  const result = await client.rpc(name, args);
  expect(result.error, `${name} should not fail`).toBeNull();
  return (Array.isArray(result.data) ? result.data : []) as T[];
}

function numberField(row: RpcRow, key: string) {
  const value = row[key];
  return typeof value === "number" ? value : Number(value);
}

function stringField(row: RpcRow, key: string) {
  return String(row[key] ?? "");
}

async function setup() {
  await db.connect();
  await query(
    "insert into public.schools(id,name,slug,school_code) values($1,'Analytics Integration School A',$2,'ANALYTICS-A'),($3,'Analytics Integration School B',$4,'ANALYTICS-B')",
    [
      ids.schoolA,
      `analytics-a-${Date.now()}`,
      ids.schoolB,
      `analytics-b-${Date.now()}`,
    ],
  );
  const schoolAdmin = await createActor("school-admin", "SCHOOL_ADMIN");
  await createActor("head-teacher", "HEAD_TEACHER");
  await createActor("registrar", "ACADEMIC_REGISTRAR");
  await createActor("class-teacher", "CLASS_TEACHER");
  await createActor("subject-teacher", "SUBJECT_TEACHER");
  await createActor("reports-only", "HEAD_TEACHER");
  await createActor("marks-only", "SUBJECT_TEACHER");
  await createActor("suspended", "SCHOOL_ADMIN", ids.schoolA, "SUSPENDED");
  const multi = await createActor("multi-school", "SCHOOL_ADMIN");
  const multiBMembership = randomUUID();
  multiBMembershipForCleanup = multiBMembership;
  await query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [multiBMembership, ids.schoolB, multi.userId, `AN-MULTI-B-${randomUUID()}`],
  );
  await query(
    "insert into public.staff_role_assignments(id,membership_id,role,granted_at) values($1,$2,'SCHOOL_ADMIN',now()-interval '1 day')",
    [randomUUID(), multiBMembership],
  );

  await query(
    "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,'Analytics Year A','2043-01-01','2043-12-31','ACTIVE'),($3,$4,'Analytics Year B','2043-01-01','2043-12-31','ACTIVE')",
    [ids.yearA, ids.schoolA, ids.yearB, ids.schoolB],
  );
  await query(
    "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status) values($1,$2,'Analytics Term A',1,'2043-01-01','2043-06-30','MARKS_ENTRY'),($3,$4,'Analytics Term B',1,'2043-01-01','2043-06-30','LOCKED')",
    [ids.termA, ids.yearA, ids.termB, ids.yearB],
  );
  await query(
    "insert into public.grade_levels(id,school_id,code,name,sort_order) values($1,$2,'ANA','Analytics Grade A',1),($3,$2,'ANB','Analytics Grade B',2),($4,$2,'UNU','Unused Active Grade',3),($5,$6,'OTH','Other School Grade',1)",
    [
      ids.gradeA,
      ids.schoolA,
      ids.gradeB,
      ids.gradeUnused,
      ids.gradeOther,
      ids.schoolB,
    ],
  );
  await query(
    "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code) values($1,$2,$3,'Analytics Class A','ANA-A'),($4,$5,$6,'Analytics Class B','ANB-B'),($7,$8,$9,'Other Class B','OTH-B')",
    [
      ids.classA,
      ids.yearA,
      ids.gradeA,
      ids.classB,
      ids.yearA,
      ids.gradeB,
      ids.classOther,
      ids.yearB,
      ids.gradeOther,
    ],
  );
  await query(
    "insert into public.subjects(id,school_id,code,name,sort_order) values($1,$2,'AN-SUB','Analytics Subject',1)",
    [ids.subject, ids.schoolA],
  );
  await query(
    "insert into public.grade_level_subjects(id,grade_level_id,subject_id,is_required,contributes_to_aggregate,sort_order) values($1,$2,$3,true,true,1)",
    [ids.mappingA, ids.gradeA, ids.subject],
  );
  await query(
    "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date,date_of_birth,photo_storage_path) values($1,$6,'ANA-002','Tie','Two','2043-01-02','2032-02-03','privacy-canary-photo-path'),($2,$6,'ANA-001','Tie','One','2043-01-02','2032-02-03','privacy-canary-photo-path'),($3,$6,'ANA-010','Cutoff','Three','2043-01-02','2032-02-03','privacy-canary-photo-path'),($4,$6,'ANA-011','Cutoff','Four','2043-01-02','2032-02-03','privacy-canary-photo-path'),($5,$6,'ANA-099','Incomplete','Five','2043-01-02','2032-02-03','privacy-canary-photo-path')",
    [
      ids.student1,
      ids.student2,
      ids.student3,
      ids.student4,
      ids.student5,
      ids.schoolA,
    ],
  );
  await query(
    "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,enrolled_on) values($1,$6,$11,$12,'2043-01-02'),($2,$7,$11,$12,'2043-01-02'),($3,$8,$11,$12,'2043-01-02'),($4,$9,$11,$12,'2043-01-02'),($5,$10,$11,$12,'2043-01-02')",
    [
      ids.enrollment1,
      ids.enrollment2,
      ids.enrollment3,
      ids.enrollment4,
      ids.enrollment5,
      ids.student1,
      ids.student2,
      ids.student3,
      ids.student4,
      ids.student5,
      ids.yearA,
      ids.classA,
    ],
  );
  await query(
    "insert into public.guardians(id,school_id,first_name,last_name,phone,email) values($1,$2,'privacy-canary-guardian','privacy-canary-family','+256700000001','privacy.canary@example.com')",
    [ids.guardian, ids.schoolA],
  );
  await query(
    "insert into public.student_guardians(id,student_id,guardian_id,relationship) values($1,$2,$3,'privacy-canary-relationship')",
    [ids.student1, ids.student1, ids.guardian],
  );
  await query(
    "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,'2043-01-02')",
    [
      ids.assignment,
      ids.termA,
      ids.classA,
      ids.subject,
      schoolAdmin.membershipId,
    ],
  );
  await query(
    "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,status,effective_from,created_by) values($1,$2,$3,$4,'Analytics Scheme','DRAFT','2043-01-02',$5)",
    [ids.scheme, ids.termA, ids.gradeA, ids.subject, schoolAdmin.membershipId],
  );
  await query(
    "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values($1,$2,'Analytics Exam','AN-EXAM',100,100,1)",
    [ids.component, ids.scheme],
  );
  await query(
    "update public.assessment_schemes set status='ACTIVE' where id=$1",
    [ids.scheme],
  );
  await query(
    "insert into public.mark_sheets(id,term_id,class_section_id,subject_id,assessment_scheme_id,teaching_assignment_id) values($1,$2,$3,$4,$5,$6)",
    [ids.sheet, ids.termA, ids.classA, ids.subject, ids.scheme, ids.assignment],
  );
  await query(
    "insert into public.marks(mark_sheet_id,assessment_component_id,enrollment_id,score,attendance_status,created_by,updated_by) values($1,$2,$3,95,'PRESENT',$6,$6),($1,$2,$4,95,'PRESENT',$6,$6),($1,$2,$5,70,'PRESENT',$6,$6),($1,$2,$7,70,'PRESENT',$6,$6)",
    [
      ids.sheet,
      ids.component,
      ids.enrollment1,
      ids.enrollment2,
      ids.enrollment3,
      schoolAdmin.membershipId,
      ids.enrollment4,
    ],
  );
  await query(
    "insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,effective_from,created_by) values($1,$2,$3,$4,'Duplicate Grade Labels',1,false,'2043-01-02',$5)",
    [ids.scale, ids.schoolA, ids.yearA, ids.gradeA, schoolAdmin.membershipId],
  );
  await query(
    "insert into public.grading_bands(grading_scale_id,minimum_score,maximum_score,grade,aggregate_points,is_pass,sort_order) values($1,0,49,'B',1,false,1),($1,50,79,'A',2,true,2),($1,80,100,'A',3,true,3)",
    [ids.scale],
  );
  await query("update public.grading_scales set is_active=true where id=$1", [
    ids.scale,
  ]);
  await query(
    "insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,version,ranking_basis,tie_method,configuration,is_active,created_by) values($1,$2,$3,$4,'Analytics Ranking',1,'AVERAGE','DENSE',$5,false,$6)",
    [
      ids.rule,
      ids.schoolA,
      ids.yearA,
      ids.gradeA,
      JSON.stringify({
        direction: "DESC",
        include_incomplete: true,
        minimum_subjects: 1,
      }),
      schoolAdmin.membershipId,
    ],
  );
  await query("update public.ranking_rules set is_active=true where id=$1", [
    ids.rule,
  ]);
  await query(
    "insert into public.aggregate_classification_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,created_by) values($1,$2,$3,$4,'Duplicate Classification Labels',1,false,$5)",
    [
      ids.classification,
      ids.schoolA,
      ids.yearA,
      ids.gradeA,
      schoolAdmin.membershipId,
    ],
  );
  await query(
    "insert into public.aggregate_classification_bands(scale_id,minimum_aggregate,maximum_aggregate,label,sort_order) values($1,0,2,'Good',1),($1,3,5,'Good',2),($1,6,10,'Needs support',3)",
    [ids.classification],
  );
  await query(
    "update public.aggregate_classification_scales set is_active=true where id=$1",
    [ids.classification],
  );
  await query(
    "select set_config('app.marks_workflow_transition','allowed',true)",
  );
  await query(
    "update public.mark_sheets set workflow_status='LOCKED',locked_by=$2,locked_at=now() where id=$1",
    [ids.sheet, schoolAdmin.membershipId],
  );
  await query(
    "select set_config('app.term_marks_workflow_transition','allowed',true)",
  );
  await query("update public.terms set status='LOCKED' where id=$1", [
    ids.termA,
  ]);

  reader = await signIn(schoolAdmin);
  const calculated = await reader.rpc("calculate_grade_results", {
    target_term_id: ids.termA,
    target_grade_level_id: ids.gradeA,
    target_grading_scale_id: ids.scale,
    target_ranking_rule_id: ids.rule,
    target_aggregate_classification_scale_id: ids.classification,
  });
  if (calculated.error) throw calculated.error;
  runId =
    (calculated.data as { calculation_run_id: string }[])[0]
      ?.calculation_run_id ?? "";
  if (!runId)
    throw new Error("The real Stage 11 fixture did not produce a run.");
  await query(
    "insert into public.result_calculation_runs(id,term_id,grade_level_id,version,grading_scale_id,ranking_rule_id,input_checksum,output_checksum) values($1,$2,$3,1,$4,$5,repeat('b',64),repeat('c',64))",
    [ids.foreignRun, ids.termB, ids.gradeOther, ids.scale, ids.rule],
  );
}

describe.sequential("Stage 16 real analytics integration", () => {
  beforeAll(setup);
  afterAll(async () => {
    const membershipIds = actors.map((actor) => actor.membershipId);
    const userIds = actors.map((actor) => actor.userId);
    const cleanup: Array<[string, unknown[]]> = [
      [
        "delete from public.calculated_subject_results where calculation_run_id in (select id from public.result_calculation_runs where term_id in ($1,$2))",
        [ids.termA, ids.termB],
      ],
      [
        "delete from public.calculated_student_results where calculation_run_id in (select id from public.result_calculation_runs where term_id in ($1,$2))",
        [ids.termA, ids.termB],
      ],
      [
        "delete from public.calculated_component_explanations where calculation_run_id in (select id from public.result_calculation_runs where term_id in ($1,$2))",
        [ids.termA, ids.termB],
      ],
      [
        "delete from public.calculated_subject_performance where calculation_run_id in (select id from public.result_calculation_runs where term_id in ($1,$2))",
        [ids.termA, ids.termB],
      ],
      [
        "delete from public.calculated_grade_subject_performance where calculation_run_id in (select id from public.result_calculation_runs where term_id in ($1,$2))",
        [ids.termA, ids.termB],
      ],
      [
        "delete from public.result_calculation_sources where calculation_run_id in (select id from public.result_calculation_runs where term_id in ($1,$2))",
        [ids.termA, ids.termB],
      ],
      [
        "delete from public.result_calculation_runs where term_id in ($1,$2)",
        [ids.termA, ids.termB],
      ],
      [
        "delete from public.marks where mark_sheet_id in (select id from public.mark_sheets where term_id in ($1,$2))",
        [ids.termA, ids.termB],
      ],
      [
        "delete from public.mark_sheets where term_id in ($1,$2)",
        [ids.termA, ids.termB],
      ],
      [
        "delete from public.assessment_components where assessment_scheme_id in (select id from public.assessment_schemes where term_id in ($1,$2))",
        [ids.termA, ids.termB],
      ],
      [
        "delete from public.assessment_schemes where term_id in ($1,$2)",
        [ids.termA, ids.termB],
      ],
      [
        "delete from public.teaching_assignments where term_id in ($1,$2)",
        [ids.termA, ids.termB],
      ],
      [
        "delete from public.aggregate_classification_bands where scale_id=$1",
        [ids.classification],
      ],
      [
        "delete from public.aggregate_classification_scales where id=$1",
        [ids.classification],
      ],
      [
        "delete from public.grading_bands where grading_scale_id=$1",
        [ids.scale],
      ],
      ["delete from public.grading_scales where id=$1", [ids.scale]],
      ["delete from public.ranking_rules where id=$1", [ids.rule]],
      [
        "delete from public.grade_level_subjects where grade_level_id in ($1,$2)",
        [ids.gradeA, ids.gradeB],
      ],
      [
        "delete from public.student_guardians where guardian_id=$1",
        [ids.guardian],
      ],
      ["delete from public.guardians where id=$1", [ids.guardian]],
      [
        "delete from public.enrollments where academic_year_id in ($1,$2)",
        [ids.yearA, ids.yearB],
      ],
      [
        "delete from public.students where school_id in ($1,$2)",
        [ids.schoolA, ids.schoolB],
      ],
      [
        "delete from public.class_sections where academic_year_id in ($1,$2)",
        [ids.yearA, ids.yearB],
      ],
      ["delete from public.subjects where id=$1", [ids.subject]],
      [
        "delete from public.grade_levels where school_id in ($1,$2)",
        [ids.schoolA, ids.schoolB],
      ],
      [
        "delete from public.terms where academic_year_id in ($1,$2)",
        [ids.yearA, ids.yearB],
      ],
      [
        "delete from public.academic_years where id in ($1,$2)",
        [ids.yearA, ids.yearB],
      ],
      [
        "delete from internal.staff_session_active_memberships where profile_id = any($1::uuid[])",
        [userIds],
      ],
      [
        "delete from public.staff_role_assignments where membership_id = any($1::uuid[])",
        [[...membershipIds, multiBMembershipForCleanup].filter(Boolean)],
      ],
      [
        "delete from public.school_staff_memberships where id = any($1::uuid[])",
        [[...membershipIds, multiBMembershipForCleanup].filter(Boolean)],
      ],
      ["delete from public.profiles where id = any($1::uuid[])", [userIds]],
      [
        "delete from public.schools where id in ($1,$2)",
        [ids.schoolA, ids.schoolB],
      ],
    ];
    const immutableFixtureRows =
      /public\.(student_guardians|guardians|enrollments|students|class_sections|subjects|grade_levels|terms|academic_years|schools|profiles|teaching_assignments)\b/;
    for (const [statement, values] of cleanup) {
      if (immutableFixtureRows.test(statement)) continue;
      await query(statement, values);
    }
    for (const actor of actors) await admin.auth.admin.deleteUser(actor.userId);
    await db.end();
  });

  it("01. produces a real Stage 11 calculation run", () =>
    expect(runId).toMatch(/^[0-9a-f-]{36}$/));
  it("02. selected school scope is readable", async () =>
    expect(
      (await rows(reader, "list_analytics_scopes")).some(
        (row) => row.grade_level_id === ids.gradeA,
      ),
    ).toBe(true));
  it("03. term scope uses the selected academic year", async () =>
    expect(
      (await rows(reader, "list_analytics_scopes")).find(
        (row) => row.grade_level_id === ids.gradeA,
      )?.academic_year_id,
    ).toBe(ids.yearA));
  it("04. real active class makes a grade eligible", async () =>
    expect(
      (await rows(reader, "list_analytics_scopes")).map(
        (row) => row.grade_level_id,
      ),
    ).toContain(ids.gradeA));
  it("05. active grade without a term-year class is excluded", async () =>
    expect(
      (await rows(reader, "list_analytics_scopes")).map(
        (row) => row.grade_level_id,
      ),
    ).not.toContain(ids.gradeUnused));
  it("06. curriculumless actual class remains an unavailable scope", async () =>
    expect(
      (await rows(reader, "list_analytics_scopes")).find(
        (row) => row.grade_level_id === ids.gradeB,
      )?.readiness_state,
    ).toBe("NO_RUN"));
  it("07. school eligible count excludes unused active grade", async () =>
    expect(
      (
        await rows(reader, "get_school_analytics", {
          target_term_id: ids.termA,
        })
      )[0]?.eligible_grade_count,
    ).toBe(2));
  it("08. school current count contains only current run", async () =>
    expect(
      (
        await rows(reader, "get_school_analytics", {
          target_term_id: ids.termA,
        })
      )[0]?.current_grade_count,
    ).toBe(1));
  it("09. school excluded count reconciles", async () => {
    const row = (
      await rows(reader, "get_school_analytics", { target_term_id: ids.termA })
    )[0];
    expect(row?.excluded_grade_count).toBe(
      numberField(row, "eligible_grade_count") -
        numberField(row, "current_grade_count"),
    );
  });
  it("10. source population includes only eligible term-year grades", async () =>
    expect(
      (
        await rows(reader, "get_school_analytics", {
          target_term_id: ids.termA,
        })
      )[0]?.source_student_population,
    ).toBe(5));
  it("11. current grade metrics are available", async () =>
    expect(
      (await rows(reader, "get_grade_analytics", { target_run_id: runId }))[0]
        ?.analytics_population,
    ).toBe(5));
  it("12. complete and incomplete counts reconcile", async () => {
    const row = (
      await rows(reader, "get_grade_analytics", { target_run_id: runId })
    )[0];
    expect(
      numberField(row, "complete_count") + numberField(row, "incomplete_count"),
    ).toBe(row?.analytics_population);
  });
  it("13. average denominator excludes null averages", async () =>
    expect(
      (await rows(reader, "get_grade_analytics", { target_run_id: runId }))[0]
        ?.average_population_count,
    ).toBe(4));
  it("14. mean average is not zero-filled", async () =>
    expect(
      (await rows(reader, "get_grade_analytics", { target_run_id: runId }))[0]
        ?.mean_overall_average,
    ).toBe(82.5));
  it("15. ranking eligible count is persisted output", async () =>
    expect(
      (await rows(reader, "get_grade_analytics", { target_run_id: runId }))[0]
        ?.ranking_eligible_count,
    ).toBe(4));
  it("16. graded count excludes incomplete result", async () =>
    expect(
      (await rows(reader, "get_grade_analytics", { target_run_id: runId }))[0]
        ?.graded_count,
    ).toBe(4));
  it("17. aggregate classified count excludes null classification", async () =>
    expect(
      (await rows(reader, "get_grade_analytics", { target_run_id: runId }))[0]
        ?.aggregate_classified_count,
    ).toBe(4));
  it("18. duplicate grade label appears once", async () =>
    expect(
      (
        await rows(reader, "list_analytics_distributions", {
          target_run_id: runId,
          target_class_section_id: null,
        })
      ).filter(
        (row) => row.distribution_type === "OVERALL_GRADE" && row.label === "A",
      ),
    ).toHaveLength(1));
  it("19. duplicate grade count is exact", async () =>
    expect(
      (
        await rows(reader, "list_analytics_distributions", {
          target_run_id: runId,
          target_class_section_id: null,
        })
      ).find(
        (row) => row.distribution_type === "OVERALL_GRADE" && row.label === "A",
      )?.row_count,
    ).toBe(4));
  it("20. grade distribution sum equals graded population", async () => {
    const rowsForRun = await rows(reader, "list_analytics_distributions", {
      target_run_id: runId,
      target_class_section_id: null,
    });
    expect(
      rowsForRun
        .filter((row) => row.distribution_type === "OVERALL_GRADE")
        .reduce((sum, row) => sum + numberField(row, "row_count"), 0),
    ).toBe(4);
  });
  it("21. grade denominator is explicit", async () =>
    expect(
      (
        await rows(reader, "list_analytics_distributions", {
          target_run_id: runId,
          target_class_section_id: null,
        })
      ).find((row) => row.distribution_type === "OVERALL_GRADE")
        ?.distribution_population,
    ).toBe(4));
  it("22. ungraded count is explicit", async () =>
    expect(
      (
        await rows(reader, "list_analytics_distributions", {
          target_run_id: runId,
          target_class_section_id: null,
        })
      ).find((row) => row.distribution_type === "OVERALL_GRADE")
        ?.ungraded_count,
    ).toBe(1));
  it("23. duplicate classification label appears once", async () =>
    expect(
      (
        await rows(reader, "list_analytics_distributions", {
          target_run_id: runId,
          target_class_section_id: null,
        })
      ).filter(
        (row) =>
          row.distribution_type === "AGGREGATE_CLASSIFICATION" &&
          row.label === "Good",
      ),
    ).toHaveLength(1));
  it("24. duplicate classification count is exact", async () =>
    expect(
      (
        await rows(reader, "list_analytics_distributions", {
          target_run_id: runId,
          target_class_section_id: null,
        })
      ).find(
        (row) =>
          row.distribution_type === "AGGREGATE_CLASSIFICATION" &&
          row.label === "Good",
      )?.row_count,
    ).toBe(4));
  it("25. classification distribution sum equals classified population", async () => {
    const rowsForRun = await rows(reader, "list_analytics_distributions", {
      target_run_id: runId,
      target_class_section_id: null,
    });
    expect(
      rowsForRun
        .filter((row) => row.distribution_type === "AGGREGATE_CLASSIFICATION")
        .reduce((sum, row) => sum + numberField(row, "row_count"), 0),
    ).toBe(4);
  });
  it("26. configured duplicate label uses minimum order", async () =>
    expect(
      (
        await rows(reader, "list_analytics_distributions", {
          target_run_id: runId,
          target_class_section_id: null,
        })
      ).find((row) => row.label === "Good")?.sort_order,
    ).toBe(1));
  it("27. grade top list uses persisted positions", async () =>
    expect(
      (
        await rows(reader, "list_analytics_top_students", {
          target_run_id: runId,
          target_class_section_id: null,
          max_position: 2,
        })
      ).every((row) => [1, 2].includes(numberField(row, "rank_position"))),
    ).toBe(true));
  it("28. grade top list orders ties by admission", async () => {
    const result = await rows(reader, "list_analytics_top_students", {
      target_run_id: runId,
      target_class_section_id: null,
      max_position: 1,
    });
    expect(result.map((row) => row.admission_number)).toEqual([
      "ANA-001",
      "ANA-002",
    ]);
  });
  it("29. class top list uses class positions", async () =>
    expect(
      (
        await rows(reader, "list_analytics_top_students", {
          target_run_id: runId,
          target_class_section_id: ids.classA,
          max_position: 2,
        })
      ).length,
    ).toBe(4));
  it("30. tie cutoff includes every tied learner", async () =>
    expect(
      (
        await rows(reader, "list_analytics_top_students", {
          target_run_id: runId,
          target_class_section_id: null,
          max_position: 2,
        })
      ).length,
    ).toBe(4));
  it("31. pathological max position is bounded", async () =>
    expect(
      (
        await rows(reader, "list_analytics_top_students", {
          target_run_id: runId,
          target_class_section_id: null,
          max_position: 500,
        })
      ).length,
    ).toBe(4));
  it("32. subject mean comes from Stage 11", async () =>
    expect(
      (
        await rows(reader, "list_analytics_subject_performance", {
          target_run_id: runId,
          target_class_section_id: null,
        })
      )[0]?.mean_score,
    ).toBe(82.5));
  it("33. subject range is preserved", async () => {
    const row = (
      await rows(reader, "list_analytics_subject_performance", {
        target_run_id: runId,
        target_class_section_id: null,
      })
    )[0];
    expect([row?.minimum_score, row?.maximum_score]).toEqual([70, 95]);
  });
  it("34. subject pass rate is preserved", async () =>
    expect(
      (
        await rows(reader, "list_analytics_subject_performance", {
          target_run_id: runId,
          target_class_section_id: null,
        })
      )[0]?.pass_rate,
    ).toBe(50));
  it("35. incomplete subject attention is factual", async () =>
    expect(
      (
        await rows(reader, "list_analytics_attention_students", {
          target_run_id: runId,
          target_class_section_id: null,
        })
      ).some((row) =>
        stringField(row, "attention_reason").includes("Incomplete"),
      ),
    ).toBe(true));
  it("36. passing learner is absent from attention", async () =>
    expect(
      (
        await rows(reader, "list_analytics_attention_students", {
          target_run_id: runId,
          target_class_section_id: null,
        })
      ).map((row) => row.enrollment_id),
    ).not.toContain(ids.enrollment1));
  it("37. attention contains no promotion language", async () =>
    expect(
      JSON.stringify(
        await rows(reader, "list_analytics_attention_students", {
          target_run_id: runId,
          target_class_section_id: null,
        }),
      ),
    ).not.toMatch(/PROMOTE|REPEAT|RETAIN/i));
  it("38. student detail is isolated to the run", async () =>
    expect(
      await rows(reader, "get_analytics_student", {
        target_run_id: runId,
        target_enrollment_id: ids.enrollment1,
      }),
    ).toHaveLength(1));
  it("39. student subjects are isolated to the learner", async () =>
    expect(
      (
        await rows(reader, "list_analytics_student_subjects", {
          target_run_id: runId,
          target_enrollment_id: ids.enrollment1,
        })
      ).every((row) => row.subject_id === ids.subject),
    ).toBe(true));
  it("40. cross-school run returns no detail", async () =>
    expect(
      await rows(reader, "get_grade_analytics", {
        target_run_id: ids.foreignRun,
      }),
    ).toHaveLength(0));
  it("41. unknown enrollment returns no detail", async () =>
    expect(
      await rows(reader, "get_analytics_student", {
        target_run_id: runId,
        target_enrollment_id: ids.credential,
      }),
    ).toHaveLength(0));
  it("42. repeated scope reads are deterministic", async () =>
    expect(await rows(reader, "list_analytics_scopes")).toEqual(
      await rows(reader, "list_analytics_scopes"),
    ));
  it("43. repeated distribution reads are deterministic", async () =>
    expect(
      await rows(reader, "list_analytics_distributions", {
        target_run_id: runId,
        target_class_section_id: null,
      }),
    ).toEqual(
      await rows(reader, "list_analytics_distributions", {
        target_run_id: runId,
        target_class_section_id: null,
      }),
    ));
  it("44. analytics reads do not create runs", async () => {
    const before = Number(
      (
        await query(
          "select count(*)::int as count from public.result_calculation_runs",
        )
      ).rows[0].count,
    );
    await rows(reader, "get_school_analytics", { target_term_id: ids.termA });
    await rows(reader, "get_grade_analytics", { target_run_id: runId });
    await rows(reader, "list_analytics_class_summaries", {
      target_run_id: runId,
    });
    await rows(reader, "list_analytics_distributions", {
      target_run_id: runId,
      target_class_section_id: null,
    });
    await rows(reader, "list_analytics_subject_performance", {
      target_run_id: runId,
      target_class_section_id: null,
    });
    await rows(reader, "list_analytics_top_students", {
      target_run_id: runId,
      target_class_section_id: null,
    });
    await rows(reader, "list_analytics_attention_students", {
      target_run_id: runId,
      target_class_section_id: null,
    });
    await rows(reader, "get_analytics_student", {
      target_run_id: runId,
      target_enrollment_id: ids.enrollment1,
    });
    const after = Number(
      (
        await query(
          "select count(*)::int as count from public.result_calculation_runs",
        )
      ).rows[0].count,
    );
    expect(after).toBe(before);
  });
  it("45. privacy canaries are absent from analytics serialization", async () => {
    const payload = JSON.stringify({
      scopes: await rows(reader, "list_analytics_scopes"),
      grade: await rows(reader, "get_grade_analytics", {
        target_run_id: runId,
      }),
      student: await rows(reader, "get_analytics_student", {
        target_run_id: runId,
        target_enrollment_id: ids.enrollment1,
      }),
    });
    expect(payload).not.toContain("privacy-canary");
    expect(payload).not.toContain("2032-02-03");
  });
  it("46. signed-out reader is denied", async () => {
    const anonymous = createClient(url!, anonKey!, {
      auth: { persistSession: false },
    });
    const result = await anonymous.rpc("list_analytics_scopes");
    expect(result.error).not.toBeNull();
  });
  it("47. class teacher is denied", async () => {
    const actor = actors.find((item) => item.role === "CLASS_TEACHER")!;
    const client = await signIn(actor);
    const result = await client.rpc("list_analytics_scopes");
    expect(result.error).not.toBeNull();
  });
  it("48. subject teacher is denied", async () => {
    const actor = actors.find((item) => item.role === "SUBJECT_TEACHER")!;
    const client = await signIn(actor);
    const result = await client.rpc("list_analytics_scopes");
    expect(result.error).not.toBeNull();
  });
  it("49. school admin is allowed", async () =>
    expect(
      (await rows(reader, "list_analytics_scopes")).length,
    ).toBeGreaterThan(0));
  it("50. head teacher is allowed", async () =>
    expect(
      (
        await rows(
          await signIn(actors.find((item) => item.role === "HEAD_TEACHER")!),
          "list_analytics_scopes",
        )
      ).length,
    ).toBeGreaterThan(0));
  it("51. registrar is allowed", async () =>
    expect(
      (
        await rows(
          await signIn(
            actors.find((item) => item.role === "ACADEMIC_REGISTRAR")!,
          ),
          "list_analytics_scopes",
        )
      ).length,
    ).toBeGreaterThan(0));
  it("52. suspended membership is denied on the next request", async () => {
    const actor = actors.find(
      (item) =>
        item.role === "SCHOOL_ADMIN" && item.email.includes("suspended"),
    )!;
    const client = createClient(url!, anonKey!, {
      auth: { persistSession: false },
    });
    await client.auth.signInWithPassword({ email: actor.email, password });
    const result = await client.rpc("list_analytics_scopes");
    expect(result.error).not.toBeNull();
  });
  it("53. selected membership switch changes school authority", async () => {
    const actor = actors.find((item) => item.email.includes("multi-school"))!;
    const client = await signIn(actor);
    const second = await query(
      "select id from public.school_staff_memberships where profile_id=$1 and school_id=$2",
      [actor.userId, ids.schoolB],
    );
    await client.rpc("set_my_active_membership", {
      target_membership_id: second.rows[0].id,
    });
    const other = await rows(client, "list_analytics_scopes");
    expect(other.every((row) => row.academic_year_id === ids.yearB)).toBe(true);
  });
  it("54. revoked analytics role is denied next request", async () => {
    const actor = actors.find((item) => item.email.includes("reports-only"))!;
    const client = await signIn(actor);
    await query(
      "update public.staff_role_assignments set revoked_at=now() where membership_id=$1",
      [actor.membershipId],
    );
    const result = await client.rpc("list_analytics_scopes");
    expect(result.error).not.toBeNull();
  });
  it("55. unlocked latest source makes the run unavailable", async () => {
    await query(
      "select set_config('app.marks_workflow_transition','allowed',true)",
    );
    await query(
      "update public.mark_sheets set workflow_status='DRAFT' where id=$1",
      [ids.sheet],
    );
    const result = await reader.rpc("get_grade_analytics", {
      target_run_id: runId,
    });
    expect(result.data).toEqual([]);
    await query(
      "update public.mark_sheets set workflow_status='LOCKED',locked_by=(select id from public.school_staff_memberships where id=$2),locked_at=now() where id=$1",
      [
        ids.sheet,
        actors.find((item) => item.role === "SCHOOL_ADMIN")!.membershipId,
      ],
    );
  });
});
