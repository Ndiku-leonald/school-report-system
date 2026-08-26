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
    throw new Error(`${name} is required for live results integration tests.`);
}

const password = "synthetic-stage-eleven-results-password";
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
    "user",
    "membership",
    "year",
    "term",
    "grade",
    "classA",
    "classB",
    "subjectA",
    "subjectB",
    "subjectC",
    "studentA",
    "studentB",
    "studentC",
    "studentD",
    "enrollmentA",
    "enrollmentB",
    "enrollmentC",
    "enrollmentD",
    "scale",
    "schoolScale",
    "rule",
    "schoolRule",
    "schemeA",
    "schemeB",
    "schemeC",
    "componentA",
    "componentB",
    "componentC",
    "sheetA1",
    "sheetA2",
    "sheetA3",
    "sheetB1",
    "sheetB2",
    "sheetB3",
    "assignmentA1",
    "assignmentA2",
    "assignmentA3",
    "assignmentB1",
    "assignmentB2",
    "assignmentB3",
  ].map((key) => [key, randomUUID()]),
) as Record<string, string>;
let client: SupabaseClient;
let runId = "";

type PolicyFixture = {
  term: string;
  grade: string;
  scale: string;
  rule: string;
  enrollments: string[];
  admissions: string[];
};

const policyFixtures: Record<string, PolicyFixture> = {};
const acceptanceFixtures: Record<string, PolicyFixture> = {};
const acceptanceClassificationScales: Record<string, string> = {};
let componentFixture: {
  term: string;
  grade: string;
  scale: string;
  rule: string;
  subjects: Record<string, string>;
  runId: string;
} | null = null;

async function query(text: string, values: unknown[] = []) {
  return db.query(text, values);
}

async function setup() {
  await db.connect();
  const user = await admin.auth.admin.createUser({
    email: `results-engine.${Date.now()}@example.invalid`,
    password,
    email_confirm: true,
  });
  if (user.error) throw user.error;
  ids.user = user.data.user.id;
  await query(
    "insert into public.schools(id,name,slug,school_code) values($1,$2,$3,$4)",
    [
      ids.school,
      "Integration Results School",
      `results-integration-${Date.now()}`,
      `RI-${Date.now()}`,
    ],
  );
  await query(
    "insert into public.profiles(id,first_name,last_name) values($1,'Integration','Results')",
    [ids.user],
  );
  await query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [ids.membership, ids.school, ids.user, `RI-STAFF-${Date.now()}`],
  );
  await query(
    "insert into public.staff_role_assignments(id,membership_id,role,granted_at) values($1,$2,'SCHOOL_ADMIN',now()-interval '1 day')",
    [randomUUID(), ids.membership],
  );
  await query(
    "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,'Integration Year','2040-01-01','2040-12-31','ACTIVE')",
    [ids.year, ids.school],
  );
  await query(
    "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status) values($1,$2,'Integration Term',1,'2040-01-01','2040-06-30','MARKS_ENTRY')",
    [ids.term, ids.year],
  );
  await query(
    "insert into public.grade_levels(id,school_id,code,name,sort_order) values($1,$2,'RI1','Integration Grade',1)",
    [ids.grade, ids.school],
  );
  await query(
    "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code) values($1,$2,$3,'Integration A','RI-A'),($4,$2,$3,'Integration B','RI-B')",
    [ids.classA, ids.year, ids.grade, ids.classB],
  );
  await query(
    "insert into public.subjects(id,school_id,code,name,sort_order) values($1,$2,'RIA','Integration English',1),($3,$2,'RIB','Integration Mathematics',2),($4,$2,'RIC','Integration Arts',3)",
    [ids.subjectA, ids.school, ids.subjectB, ids.subjectC],
  );
  await query(
    "insert into public.grade_level_subjects(grade_level_id,subject_id,is_required,contributes_to_aggregate,sort_order) values($1,$2,true,true,1),($1,$3,true,true,2),($1,$4,false,false,3)",
    [ids.grade, ids.subjectA, ids.subjectB, ids.subjectC],
  );
  await query(
    "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date) values($1,$5,'RI-001','A','One','2040-01-02'),($2,$5,'RI-002','A','Two','2040-01-02'),($3,$5,'RI-003','B','Three','2040-01-02'),($4,$5,'RI-004','B','Four','2040-01-02')",
    [ids.studentA, ids.studentB, ids.studentC, ids.studentD, ids.school],
  );
  await query(
    "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,enrolled_on) values($1,$5,$9,$10,'2040-01-02'),($2,$6,$9,$10,'2040-01-02'),($3,$7,$9,$11,'2040-01-02'),($4,$8,$9,$11,'2040-01-02')",
    [
      ids.enrollmentA,
      ids.enrollmentB,
      ids.enrollmentC,
      ids.enrollmentD,
      ids.studentA,
      ids.studentB,
      ids.studentC,
      ids.studentD,
      ids.year,
      ids.classA,
      ids.classB,
    ],
  );
  await query(
    "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$7,$8,$10,$13,'2040-01-02'),($2,$7,$8,$11,$13,'2040-01-02'),($3,$7,$8,$12,$13,'2040-01-02'),($4,$7,$9,$10,$13,'2040-01-02'),($5,$7,$9,$11,$13,'2040-01-02'),($6,$7,$9,$12,$13,'2040-01-02')",
    [
      ids.assignmentA1,
      ids.assignmentA2,
      ids.assignmentA3,
      ids.assignmentB1,
      ids.assignmentB2,
      ids.assignmentB3,
      ids.term,
      ids.classA,
      ids.classB,
      ids.subjectA,
      ids.subjectB,
      ids.subjectC,
      ids.membership,
    ],
  );
  await query(
    "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,status,effective_from,created_by) values($1,$4,$5,$6,'Integration English','DRAFT','2040-01-02',$7),($2,$4,$5,$8,'Integration Mathematics','DRAFT','2040-01-02',$7),($3,$4,$5,$9,'Integration Arts','DRAFT','2040-01-02',$7)",
    [
      ids.schemeA,
      ids.schemeB,
      ids.schemeC,
      ids.term,
      ids.grade,
      ids.subjectA,
      ids.membership,
      ids.subjectB,
      ids.subjectC,
    ],
  );
  await query(
    "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values($1,$4,'English Exam','ENG',100,100,1),($2,$5,'Math Exam','MAT',100,100,1),($3,$6,'Arts Exam','ART',100,100,1)",
    [
      ids.componentA,
      ids.componentB,
      ids.componentC,
      ids.schemeA,
      ids.schemeB,
      ids.schemeC,
    ],
  );
  await query(
    "update public.assessment_schemes set status='ACTIVE' where id = any($1::uuid[])",
    [[ids.schemeA, ids.schemeB, ids.schemeC]],
  );
  await query(
    "insert into public.mark_sheets(id,term_id,class_section_id,subject_id,assessment_scheme_id,teaching_assignment_id) values($1,$7,$8,$10,$13,$16),($2,$7,$8,$11,$14,$17),($3,$7,$8,$12,$15,$18),($4,$7,$9,$10,$13,$19),($5,$7,$9,$11,$14,$20),($6,$7,$9,$12,$15,$21)",
    [
      ids.sheetA1,
      ids.sheetA2,
      ids.sheetA3,
      ids.sheetB1,
      ids.sheetB2,
      ids.sheetB3,
      ids.term,
      ids.classA,
      ids.classB,
      ids.subjectA,
      ids.subjectB,
      ids.subjectC,
      ids.schemeA,
      ids.schemeB,
      ids.schemeC,
      ids.assignmentA1,
      ids.assignmentA2,
      ids.assignmentA3,
      ids.assignmentB1,
      ids.assignmentB2,
      ids.assignmentB3,
    ],
  );
  await query(
    "with actor as (select id from public.school_staff_memberships where school_id=$14 limit 1) insert into public.marks(mark_sheet_id,assessment_component_id,enrollment_id,score,attendance_status,created_by,updated_by) values($1,$7,$10,90,'PRESENT',(select id from actor),(select id from actor)),($1,$7,$11,90,'PRESENT',(select id from actor),(select id from actor)),($2,$8,$10,80,'PRESENT',(select id from actor),(select id from actor)),($4,$7,$12,90,'PRESENT',(select id from actor),(select id from actor)),($5,$8,$12,70,'PRESENT',(select id from actor),(select id from actor)),($5,$8,$13,60,'PRESENT',(select id from actor),(select id from actor)),($4,$7,$13,null,'ABSENT',(select id from actor),(select id from actor)),($3,$9,$10,null,'EXEMPTED',(select id from actor),(select id from actor)),($3,$9,$11,null,'EXEMPTED',(select id from actor),(select id from actor)),($6,$9,$12,null,'EXEMPTED',(select id from actor),(select id from actor)),($6,$9,$13,null,'EXEMPTED',(select id from actor),(select id from actor))",
    [
      ids.sheetA1,
      ids.sheetA2,
      ids.sheetA3,
      ids.sheetB1,
      ids.sheetB2,
      ids.sheetB3,
      ids.componentA,
      ids.componentB,
      ids.componentC,
      ids.enrollmentA,
      ids.enrollmentB,
      ids.enrollmentC,
      ids.enrollmentD,
      ids.school,
    ],
  );
  await query(
    "insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,effective_from,created_by) values($1,$2,$3,$4,'Integration Scale',1,false,'2040-01-02',$5)",
    [ids.scale, ids.school, ids.year, ids.grade, ids.membership],
  );
  await query(
    "insert into public.grading_bands(grading_scale_id,minimum_score,maximum_score,grade,aggregate_points,is_pass,sort_order) values($1,0,50,'F',1,false,1),($1,50,80,'C',2,true,2),($1,80,100,'A',3,true,3)",
    [ids.scale],
  );
  await query("update public.grading_scales set is_active=true where id=$1", [
    ids.scale,
  ]);
  await query(
    "insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,effective_from,created_by) values($1,$2,null,null,'Integration School Scale',1,false,'2040-01-02',$3)",
    [ids.schoolScale, ids.school, ids.membership],
  );
  await query(
    "insert into public.grading_bands(grading_scale_id,minimum_score,maximum_score,grade,aggregate_points,is_pass,sort_order) values($1,0,50,'F',1,false,1),($1,50,80,'C',2,true,2),($1,80,100,'A',3,true,3)",
    [ids.schoolScale],
  );
  await query("update public.grading_scales set is_active=true where id=$1", [
    ids.schoolScale,
  ]);
  await query(
    "insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,version,ranking_basis,tie_method,configuration,is_active,created_by) values($1,$2,$3,$4,'Integration Ranking',1,'AVERAGE','DENSE',$5,true,$6)",
    [
      ids.rule,
      ids.school,
      ids.year,
      ids.grade,
      JSON.stringify({
        direction: "DESC",
        include_incomplete: true,
        minimum_subjects: 1,
      }),
      ids.membership,
    ],
  );
  await query(
    "insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,version,ranking_basis,tie_method,configuration,is_active,created_by) values($1,$2,null,null,'Integration School Ranking',1,'AVERAGE','DENSE',$3,true,$4)",
    [
      ids.schoolRule,
      ids.school,
      JSON.stringify({
        direction: "DESC",
        include_incomplete: true,
        minimum_subjects: 1,
      }),
      ids.membership,
    ],
  );
  await query(
    "select set_config('app.marks_workflow_transition','allowed',false)",
  );
  await query(
    "update public.mark_sheets set workflow_status='LOCKED',locked_by=$2,locked_at=now() where term_id=$1",
    [ids.term, ids.membership],
  );
  await query(
    "select set_config('app.term_marks_workflow_transition','allowed',false)",
  );
  await query("update public.terms set status='LOCKED' where id=$1", [
    ids.term,
  ]);
  client = createClient(url!, anonKey!, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const login = await client.auth.signInWithPassword({
    email: user.data.user.email!,
    password,
  });
  if (login.error) throw login.error;
  const selected = await client.rpc("set_my_active_membership", {
    target_membership_id: ids.membership,
  });
  if (selected.error) throw selected.error;

  for (const [name, basis, direction, configuredMetric] of [
    ["total", "TOTAL", "DESC", null],
    ["average", "AVERAGE", "DESC", null],
    ["aggregate", "AGGREGATE", "ASC", null],
    ["configured-total", "CONFIGURED", "DESC", "TOTAL"],
    ["configured-average", "CONFIGURED", "DESC", "AVERAGE"],
    ["configured-aggregate", "CONFIGURED", "DESC", "AGGREGATE"],
  ] as const) {
    policyFixtures[name] = await createPolicyFixture(
      name,
      basis,
      direction,
      configuredMetric,
      "DENSE",
    );
  }
  acceptanceFixtures.rounding = await createPolicyFixture(
    "rounding",
    "AVERAGE",
    "DESC",
    null,
    "DENSE",
    [
      [89.994, 89.994, 89.994],
      [89.995, 89.995, 89.995],
      [90, 90, 90],
      [80, 80, 80],
    ],
  );
  acceptanceFixtures.partial = await createPolicyFixture(
    "partial",
    "AGGREGATE",
    "DESC",
    null,
    "DENSE",
    undefined,
    [
      ["PRESENT", "PRESENT", "PRESENT"],
      ["NOT_ASSESSED", "PRESENT", "PRESENT"],
      ["EXEMPTED", "PRESENT", "PRESENT"],
      ["PRESENT", "PRESENT", "PRESENT"],
    ],
  );
  acceptanceFixtures.missingPoints = await createPolicyFixture(
    "missing-points",
    "AGGREGATE",
    "DESC",
    null,
    "DENSE",
    undefined,
    undefined,
    true,
  );
  acceptanceFixtures.classification = await createPolicyFixture(
    "classification",
    "AGGREGATE",
    "DESC",
    null,
  );
  acceptanceFixtures.classificationUnmatched = await createPolicyFixture(
    "classification-unmatched",
    "AGGREGATE",
    "DESC",
    null,
  );
  acceptanceClassificationScales.valid = await createClassificationScale(
    acceptanceFixtures.classification,
    [
      [0, 8, "Alpha"],
      [9, 9, "Beta"],
      [10, 20, "Gamma"],
    ],
  );
  acceptanceClassificationScales.unmatched = await createClassificationScale(
    acceptanceFixtures.classificationUnmatched,
    [
      [0, 8, "Alpha"],
      [10, 20, "Gamma"],
    ],
  );
  for (const [name, tieMethod] of [
    ["dense", "DENSE"],
    ["competition", "COMPETITION"],
    ["shared", "SHARED"],
    ["ordinal", "ORDINAL"],
  ] as const) {
    policyFixtures[`tie-${name}`] = await createPolicyFixture(
      `tie-${name}`,
      "AVERAGE",
      "DESC",
      null,
      tieMethod,
    );
  }
  componentFixture = await createComponentFixture();
}

async function createPolicyFixture(
  name: string,
  basis: "TOTAL" | "AVERAGE" | "AGGREGATE" | "CONFIGURED",
  direction: "ASC" | "DESC",
  configuredMetric: "TOTAL" | "AVERAGE" | "AGGREGATE" | null,
  tieMethod: "DENSE" | "COMPETITION" | "ORDINAL" | "SHARED" = "DENSE",
  scoreRows: number[][] = [
    [100, 100, 100],
    [90, 90, 90],
    [90, 90, 90],
    [80, 80, 80],
  ],
  markStatuses?: string[][],
  missingAggregatePoints = false,
): Promise<PolicyFixture> {
  const year = randomUUID();
  const term = randomUUID();
  const grade = randomUUID();
  const classSection = randomUUID();
  const subjects = [randomUUID(), randomUUID(), randomUUID()];
  const students = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const enrollments = students.map(() => randomUUID());
  const assignments = subjects.map(() => randomUUID());
  const schemes = subjects.map(() => randomUUID());
  const components = subjects.map(() => randomUUID());
  const sheets = subjects.map(() => randomUUID());
  const scale = randomUUID();
  const rule = randomUUID();
  const yearNumber =
    2050 +
    Object.keys(policyFixtures).length +
    Object.keys(acceptanceFixtures).length;
  const admissions = [
    `P${yearNumber}-Z-010`,
    `P${yearNumber}-A-002`,
    `P${yearNumber}-M-005`,
    `P${yearNumber}-B-001`,
  ];

  await query(
    "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,$3,$4,$5,'DRAFT')",
    [
      year,
      ids.school,
      `Policy ${name}`,
      `${yearNumber}-01-01`,
      `${yearNumber}-12-31`,
    ],
  );
  await query(
    "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status) values($1,$2,$3,1,$4,$5,'MARKS_ENTRY')",
    [
      term,
      year,
      `Policy ${name} Term`,
      `${yearNumber}-01-01`,
      `${yearNumber}-06-30`,
    ],
  );
  await query(
    "insert into public.grade_levels(id,school_id,code,name,sort_order) values($1,$2,$3,$4,$5)",
    [grade, ids.school, `P${yearNumber}`, `Policy ${name} Grade`, yearNumber],
  );
  await query(
    "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code) values($1,$2,$3,$4,$5)",
    [classSection, year, grade, `Policy ${name} Class`, `P-${yearNumber}`],
  );
  await query(
    "insert into public.subjects(id,school_id,code,name,sort_order) values($1,$4,$5,$6,$11),($2,$4,$7,$8,$12),($3,$4,$9,$10,$13)",
    [
      subjects[0],
      subjects[1],
      subjects[2],
      ids.school,
      `P${yearNumber}A`,
      `Policy ${name} A`,
      `P${yearNumber}B`,
      `Policy ${name} B`,
      `P${yearNumber}C`,
      `Policy ${name} C`,
      yearNumber * 10 + 1,
      yearNumber * 10 + 2,
      yearNumber * 10 + 3,
    ],
  );
  await query(
    "insert into public.grade_level_subjects(grade_level_id,subject_id,is_required,contributes_to_aggregate,sort_order) values($1,$2,true,true,1),($1,$3,true,true,2),($1,$4,true,true,3)",
    [grade, ...subjects],
  );
  await query(
    "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date) values($1,$5,$6,'Policy','One',$10),($2,$5,$7,'Policy','Two',$10),($3,$5,$8,'Policy','Three',$10),($4,$5,$9,'Policy','Four',$10)",
    [...students, ids.school, ...admissions, `${yearNumber}-01-02`],
  );
  await query(
    "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,enrolled_on) values($1,$5,$9,$10,$11),($2,$6,$9,$10,$11),($3,$7,$9,$10,$11),($4,$8,$9,$10,$11)",
    [...enrollments, ...students, year, classSection, `${yearNumber}-01-02`],
  );
  await query(
    "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$4,$5,$6,$9,$10),($2,$4,$5,$7,$9,$10),($3,$4,$5,$8,$9,$10)",
    [
      ...assignments,
      term,
      classSection,
      ...subjects,
      ids.membership,
      `${yearNumber}-01-02`,
    ],
  );
  await query(
    "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,status,effective_from,created_by) values($1,$4,$5,$7,$8,'DRAFT',$13,$6),($2,$4,$5,$9,$10,'DRAFT',$13,$6),($3,$4,$5,$11,$12,'DRAFT',$13,$6)",
    [
      ...schemes,
      term,
      grade,
      ids.membership,
      ...subjects.flatMap((subject, index) => [
        subject,
        `Policy ${name} Scheme ${index + 1}`,
      ]),
      `${yearNumber}-01-02`,
    ],
  );
  await query(
    "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values($1,$4,$7,$10,100,100,1),($2,$5,$8,$11,100,100,1),($3,$6,$9,$12,100,100,1)",
    [
      ...components,
      ...schemes,
      ...subjects.map((_, index) => `Policy Component ${index + 1}`),
      ...subjects.map((_, index) => `P-${yearNumber}-${index + 1}`),
    ],
  );
  await query(
    "update public.assessment_schemes set status='ACTIVE' where id=any($1::uuid[])",
    [schemes],
  );
  await query(
    "insert into public.mark_sheets(id,term_id,class_section_id,subject_id,assessment_scheme_id,teaching_assignment_id) values($1,$4,$5,$6,$9,$12),($2,$4,$5,$7,$10,$13),($3,$4,$5,$8,$11,$14)",
    [...sheets, term, classSection, ...subjects, ...schemes, ...assignments],
  );

  for (
    let studentIndex = 0;
    studentIndex < enrollments.length;
    studentIndex += 1
  ) {
    for (
      let subjectIndex = 0;
      subjectIndex < subjects.length;
      subjectIndex += 1
    ) {
      await query(
        "insert into public.marks(mark_sheet_id,assessment_component_id,enrollment_id,score,attendance_status,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$6)",
        [
          sheets[subjectIndex],
          components[subjectIndex],
          enrollments[studentIndex],
          markStatuses?.[studentIndex]?.[subjectIndex] === "PRESENT"
            ? scoreRows[studentIndex][subjectIndex]
            : null,
          markStatuses?.[studentIndex]?.[subjectIndex] ?? "PRESENT",
          ids.membership,
        ],
      );
    }
  }
  await query(
    "insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,effective_from,created_by) values($1,$2,$3,$4,$5,1,false,$6,$7)",
    [
      scale,
      ids.school,
      year,
      grade,
      `Policy ${name} Scale`,
      `${yearNumber}-01-02`,
      ids.membership,
    ],
  );
  await query(
    "insert into public.grading_bands(grading_scale_id,minimum_score,maximum_score,grade,aggregate_points,is_pass,sort_order) values($1,0,50,'F',1,false,1),($1,50,80,'C',2,true,2),($1,80,100,'A',$2,true,3)",
    [scale, missingAggregatePoints ? null : 3],
  );
  await query("update public.grading_scales set is_active=true where id=$1", [
    scale,
  ]);
  await query(
    "insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,version,ranking_basis,tie_method,configuration,is_active,created_by) values($1,$2,$3,$4,$5,1,$6,$7,$8,true,$9)",
    [
      rule,
      ids.school,
      year,
      grade,
      `Policy ${name} Ranking`,
      basis,
      tieMethod,
      JSON.stringify({
        direction,
        include_incomplete: false,
        minimum_subjects: 1,
        ...(configuredMetric ? { configured_metric: configuredMetric } : {}),
      }),
      ids.membership,
    ],
  );
  await query(
    "select set_config('app.marks_workflow_transition','allowed',true)",
  );
  await query(
    "update public.mark_sheets set workflow_status='LOCKED',locked_by=$2,locked_at=now() where term_id=$1",
    [term, ids.membership],
  );
  await query(
    "select set_config('app.term_marks_workflow_transition','allowed',true)",
  );
  await query("update public.terms set status='LOCKED' where id=$1", [term]);
  return { term, grade, scale, rule, enrollments, admissions };
}

async function createClassificationScale(
  fixture: PolicyFixture,
  bands: [number, number, string][],
) {
  const scale = randomUUID();
  await query(
    "insert into public.aggregate_classification_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,created_by) values($1,$2,(select academic_year_id from public.terms where id=$3),$4,$5,1,false,$6)",
    [
      scale,
      ids.school,
      fixture.term,
      fixture.grade,
      `Acceptance ${scale}`,
      ids.membership,
    ],
  );
  for (const [index, [minimum, maximum, label]] of bands.entries()) {
    await query(
      "insert into public.aggregate_classification_bands(scale_id,minimum_aggregate,maximum_aggregate,label,sort_order) values($1,$2,$3,$4,$5)",
      [scale, minimum, maximum, label, index + 1],
    );
  }
  await query(
    "update public.aggregate_classification_scales set is_active=true where id=$1",
    [scale],
  );
  return scale;
}

async function createComponentFixture() {
  const year = randomUUID();
  const term = randomUUID();
  const grade = randomUUID();
  const classSection = randomUUID();
  const student = randomUUID();
  const enrollment = randomUUID();
  const scale = randomUUID();
  const rule = randomUUID();
  const yearNumber = 2200 + Object.keys(policyFixtures).length;
  const definitions = [
    {
      key: "zero",
      components: [
        { weight: 100, required: true, score: 0, status: "PRESENT" },
      ],
    },
    {
      key: "absent",
      components: [
        { weight: 40, required: true, score: 80, status: "PRESENT" },
        { weight: 60, required: true, score: null, status: "ABSENT" },
      ],
    },
    {
      key: "exempted",
      components: [
        { weight: 40, required: true, score: 80, status: "PRESENT" },
        { weight: 60, required: true, score: null, status: "EXEMPTED" },
      ],
    },
    {
      key: "optional-na",
      components: [
        { weight: 70, required: true, score: 75, status: "PRESENT" },
        { weight: 30, required: false, score: null, status: "NOT_ASSESSED" },
      ],
    },
    {
      key: "missing-optional",
      components: [
        { weight: 70, required: true, score: 75, status: "PRESENT" },
        { weight: 30, required: false, score: null, status: "MISSING" },
      ],
    },
    {
      key: "required-na",
      components: [
        { weight: 100, required: true, score: null, status: "NOT_ASSESSED" },
      ],
    },
    {
      key: "all-exempted",
      components: [
        { weight: 50, required: true, score: null, status: "EXEMPTED" },
        { weight: 50, required: true, score: null, status: "EXEMPTED" },
      ],
    },
  ] as const;
  const subjects = Object.fromEntries(
    definitions.map(({ key }) => [key, randomUUID()]),
  );

  await query(
    "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,$3,$4,$5,'DRAFT')",
    [
      year,
      ids.school,
      "Component Policy Year",
      `${yearNumber}-01-01`,
      `${yearNumber}-12-31`,
    ],
  );
  await query(
    "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status) values($1,$2,'Component Policy Term',1,$3,$4,'MARKS_ENTRY')",
    [term, year, `${yearNumber}-01-01`, `${yearNumber}-06-30`],
  );
  await query(
    "insert into public.grade_levels(id,school_id,code,name,sort_order) values($1,$2,$3,'Component Policy Grade',$4)",
    [grade, ids.school, `CP${yearNumber}`, yearNumber],
  );
  await query(
    "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code) values($1,$2,$3,'Component Policy Class',$4)",
    [classSection, year, grade, `CP-${yearNumber}`],
  );
  await query(
    "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date) values($1,$2,'CP-001','Component','Policy',$3)",
    [student, ids.school, `${yearNumber}-01-02`],
  );
  await query(
    "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,enrolled_on) values($1,$2,$3,$4,$5)",
    [enrollment, student, year, classSection, `${yearNumber}-01-02`],
  );
  for (const [index, definition] of definitions.entries()) {
    const subject = subjects[definition.key];
    const assignment = randomUUID();
    const scheme = randomUUID();
    const sheet = randomUUID();
    await query(
      "insert into public.subjects(id,school_id,code,name,sort_order) values($1,$2,$3,$4,$5)",
      [
        subject,
        ids.school,
        `CP-${index + 1}`,
        `Component ${definition.key}`,
        yearNumber * 10 + index + 1,
      ],
    );
    await query(
      "insert into public.grade_level_subjects(grade_level_id,subject_id,is_required,contributes_to_aggregate,sort_order) values($1,$2,true,false,$3)",
      [grade, subject, index + 1],
    );
    await query(
      "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,$6)",
      [
        assignment,
        term,
        classSection,
        subject,
        ids.membership,
        `${yearNumber}-01-02`,
      ],
    );
    await query(
      "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,status,effective_from,created_by) values($1,$2,$3,$4,$5,'DRAFT',$6,$7)",
      [
        scheme,
        term,
        grade,
        subject,
        `Component ${definition.key} Scheme`,
        `${yearNumber}-01-02`,
        ids.membership,
      ],
    );
    const componentIds: string[] = [];
    for (const [componentIndex, component] of definition.components.entries()) {
      const componentId = randomUUID();
      componentIds.push(componentId);
      await query(
        "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order,is_required) values($1,$2,$3,$4,100,$5,$6,$7)",
        [
          componentId,
          scheme,
          `Component ${componentIndex + 1}`,
          `CP-${index + 1}-${componentIndex + 1}`,
          component.weight,
          componentIndex + 1,
          component.required,
        ],
      );
    }
    await query(
      "update public.assessment_schemes set status='ACTIVE' where id=$1",
      [scheme],
    );
    await query(
      "insert into public.mark_sheets(id,term_id,class_section_id,subject_id,assessment_scheme_id,teaching_assignment_id) values($1,$2,$3,$4,$5,$6)",
      [sheet, term, classSection, subject, scheme, assignment],
    );
    for (const [componentIndex, component] of definition.components.entries()) {
      if (component.status === "MISSING") continue;
      await query(
        "insert into public.marks(mark_sheet_id,assessment_component_id,enrollment_id,score,attendance_status,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$6)",
        [
          sheet,
          componentIds[componentIndex],
          enrollment,
          component.score,
          component.status,
          ids.membership,
        ],
      );
    }
  }
  await query(
    "insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,effective_from,created_by) values($1,$2,$3,$4,'Component Policy Scale',1,false,$5,$6)",
    [scale, ids.school, year, grade, `${yearNumber}-01-02`, ids.membership],
  );
  await query(
    "insert into public.grading_bands(grading_scale_id,minimum_score,maximum_score,grade,aggregate_points,is_pass,sort_order) values($1,0,50,'F',1,false,1),($1,50,80,'C',2,true,2),($1,80,100,'A',3,true,3)",
    [scale],
  );
  await query("update public.grading_scales set is_active=true where id=$1", [
    scale,
  ]);
  await query(
    "insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,version,ranking_basis,tie_method,configuration,is_active,created_by) values($1,$2,$3,$4,'Component Policy Ranking',1,'AVERAGE','DENSE',$5,true,$6)",
    [
      rule,
      ids.school,
      year,
      grade,
      JSON.stringify({
        direction: "DESC",
        include_incomplete: true,
        minimum_subjects: 1,
      }),
      ids.membership,
    ],
  );
  await query(
    "select set_config('app.marks_workflow_transition','allowed',true)",
  );
  await query(
    "update public.mark_sheets set workflow_status='LOCKED',locked_by=$2,locked_at=now() where term_id=$1",
    [term, ids.membership],
  );
  await query(
    "select set_config('app.term_marks_workflow_transition','allowed',true)",
  );
  await query("update public.terms set status='LOCKED' where id=$1", [term]);
  return { term, grade, scale, rule, subjects, runId: "" };
}

describe.sequential(
  "live deterministic results calculation integration",
  () => {
    beforeAll(setup);
    afterAll(async () => db.end());
    it("returns an authorized readiness row", async () => {
      const r = await client.rpc("get_results_calculation_readiness", {
        target_term_id: ids.term,
        target_grade_level_id: ids.grade,
      });
      expect(r.error).toBeNull();
      expect(r.data?.[0]).toMatchObject({
        term_id: ids.term,
        grade_level_id: ids.grade,
        expected_class_subject_scopes: 6,
      });
    });
    it("reports all six latest source sheets", async () => {
      const r = await client.rpc("get_results_calculation_readiness", {
        target_term_id: ids.term,
        target_grade_level_id: ids.grade,
      });
      expect(r.data?.[0]?.source_sheet_count).toBe(6);
    });
    it("reports zero missing scopes", async () => {
      const r = await client.rpc("get_results_calculation_readiness", {
        target_term_id: ids.term,
        target_grade_level_id: ids.grade,
      });
      expect(r.data?.[0]?.missing_source_scopes).toBe(0);
    });
    it("reports zero unlocked latest sources", async () => {
      const r = await client.rpc("get_results_calculation_readiness", {
        target_term_id: ids.term,
        target_grade_level_id: ids.grade,
      });
      expect(r.data?.[0]?.non_locked_latest_scopes).toBe(0);
    });
    it("reports multiple applicable grading scales", async () => {
      const r = await client.rpc("get_results_calculation_readiness", {
        target_term_id: ids.term,
        target_grade_level_id: ids.grade,
      });
      expect(r.data?.[0]?.applicable_grading_scale_count).toBe(2);
    });
    it("reports multiple applicable ranking rules", async () => {
      const r = await client.rpc("get_results_calculation_readiness", {
        target_term_id: ids.term,
        target_grade_level_id: ids.grade,
      });
      expect(r.data?.[0]?.applicable_ranking_rule_count).toBe(2);
    });
    it("calculates and returns a run", async () => {
      const r = await client.rpc("calculate_grade_results", {
        target_term_id: ids.term,
        target_grade_level_id: ids.grade,
        target_grading_scale_id: ids.scale,
        target_ranking_rule_id: ids.rule,
        target_aggregate_classification_scale_id: null,
      });
      expect(r.error).toBeNull();
      runId = r.data?.[0]?.calculation_run_id;
      expect(runId).toBeTruthy();
    });
    it("persists version one", async () => {
      expect(
        (
          await query(
            "select version from public.result_calculation_runs where id=$1",
            [runId],
          )
        ).rows[0].version,
      ).toBe(1);
    });
    it("persists a 64-character input checksum", async () => {
      expect(
        (
          await query(
            "select input_checksum from public.result_calculation_runs where id=$1",
            [runId],
          )
        ).rows[0].input_checksum,
      ).toHaveLength(64);
    });
    it("persists a 64-character output checksum", async () => {
      expect(
        (
          await query(
            "select output_checksum from public.result_calculation_runs where id=$1",
            [runId],
          )
        ).rows[0].output_checksum,
      ).toHaveLength(64);
    });
    it("persists six curriculum source manifests", async () => {
      expect(
        (
          await query(
            "select count(*)::int count from public.result_calculation_sources where calculation_run_id=$1 and grade_level_subject_id is not null",
            [runId],
          )
        ).rows[0].count,
      ).toBe(6);
    });
    it("materializes four student results", async () => {
      expect(
        (
          await query(
            "select count(*)::int count from public.calculated_student_results where calculation_run_id=$1",
            [runId],
          )
        ).rows[0].count,
      ).toBe(4);
    });
    it("materializes twelve subject results", async () => {
      expect(
        (
          await query(
            "select count(*)::int count from public.calculated_subject_results where calculation_run_id=$1",
            [runId],
          )
        ).rows[0].count,
      ).toBe(12);
    });
    it("materializes component explanations for all cells", async () => {
      expect(
        (
          await query(
            "select count(*)::int count from public.calculated_component_explanations where calculation_run_id=$1",
            [runId],
          )
        ).rows[0].count,
      ).toBe(12);
    });
    it("materializes six class performance rows", async () => {
      expect(
        (
          await query(
            "select count(*)::int count from public.calculated_subject_performance where calculation_run_id=$1",
            [runId],
          )
        ).rows[0].count,
      ).toBe(6);
    });
    it("reads three grade-wide performance rows", async () => {
      const r = await client.rpc("list_result_grade_subject_performance", {
        target_run_id: runId,
      });
      expect(r.error).toBeNull();
      expect(r.data).toHaveLength(3);
    });
    it("calculates the first learner average", async () => {
      expect(
        (
          await query(
            "select overall_average from public.calculated_student_results where calculation_run_id=$1 and enrollment_id=$2",
            [runId, ids.enrollmentA],
          )
        ).rows[0].overall_average,
      ).toBe("85.00");
    });
    it("calculates aggregate points from contributing subjects", async () => {
      expect(
        (
          await query(
            "select aggregate_total from public.calculated_student_results where calculation_run_id=$1 and enrollment_id=$2",
            [runId, ids.enrollmentA],
          )
        ).rows[0].aggregate_total,
      ).toBe(6);
    });
    it("materializes one incomplete subject", async () => {
      expect(
        (
          await query(
            "select count(*)::int count from public.calculated_subject_results where calculation_run_id=$1 and subject_status='INCOMPLETE'",
            [runId],
          )
        ).rows[0].count,
      ).toBe(1);
    });
    it("materializes four exempted subjects", async () => {
      expect(
        (
          await query(
            "select count(*)::int count from public.calculated_subject_results where calculation_run_id=$1 and subject_status='EXEMPTED'",
            [runId],
          )
        ).rows[0].count,
      ).toBe(4);
    });
    it("keeps subject ties inside a class", async () => {
      const r = await query(
        "select subject_tie_size from public.calculated_subject_results where calculation_run_id=$1 and enrollment_id=$2 and subject_id=$3",
        [runId, ids.enrollmentA, ids.subjectA],
      );
      expect(r.rows[0].subject_tie_size).toBe(2);
    });
    it("does not carry an English tie into the other class", async () => {
      const r = await query(
        "select subject_tie_size from public.calculated_subject_results where calculation_run_id=$1 and enrollment_id=$2 and subject_id=$3",
        [runId, ids.enrollmentC, ids.subjectA],
      );
      expect(r.rows[0].subject_tie_size).toBe(1);
    });
    it("calculates grade-wide English mean", async () => {
      expect(
        (
          await query(
            "select mean_score from public.calculated_grade_subject_performance where calculation_run_id=$1 and subject_id=$2",
            [runId, ids.subjectA],
          )
        ).rows[0].mean_score,
      ).toBe("67.50");
    });
    it("marks readiness current after calculation", async () => {
      const r = await client.rpc("get_results_calculation_readiness", {
        target_term_id: ids.term,
        target_grade_level_id: ids.grade,
      });
      expect(r.data?.[0]?.up_to_date).toBe(true);
    });
    it("reuses identical inputs", async () => {
      const r = await client.rpc("calculate_grade_results", {
        target_term_id: ids.term,
        target_grade_level_id: ids.grade,
        target_grading_scale_id: ids.scale,
        target_ranking_rule_id: ids.rule,
        target_aggregate_classification_scale_id: null,
      });
      expect(r.error).toBeNull();
      expect(r.data?.[0]?.reused).toBe(true);
    });
    it("does not create a successor during reuse", async () => {
      expect(
        (
          await query(
            "select count(*)::int count from public.result_calculation_runs where term_id=$1",
            [ids.term],
          )
        ).rows[0].count,
      ).toBe(1);
    });
    it("returns no anonymous readiness access", async () => {
      const anonymous = createClient(url!, anonKey!, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      });
      const r = await anonymous.rpc("get_results_calculation_readiness", {
        target_term_id: ids.term,
        target_grade_level_id: ids.grade,
      });
      expect(r.error).not.toBeNull();
    });
    it("returns student results through the signed-in reader", async () => {
      const r = await client.rpc("list_calculated_student_results", {
        target_run_id: runId,
      });
      expect(r.error).toBeNull();
      expect(r.data).toHaveLength(4);
    });
    it("returns class performance through the signed-in reader", async () => {
      const r = await client.rpc("list_result_subject_performance", {
        target_run_id: runId,
      });
      expect(r.error).toBeNull();
      expect(r.data).toHaveLength(6);
    });
    it("reports the stored checksum after calculation", async () => {
      const r = await client.rpc("get_results_calculation_readiness", {
        target_term_id: ids.term,
        target_grade_level_id: ids.grade,
      });
      expect(r.error).toBeNull();
      expect(r.data?.[0]?.current_authoritative_input_checksum).toHaveLength(
        64,
      );
    });
    it("returns the selected calculation options with stable IDs", async () => {
      const r = await client.rpc("list_result_calculation_options", {
        target_term_id: ids.term,
        target_grade_level_id: ids.grade,
      });
      expect(r.error).toBeNull();
      expect(r.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            option_type: "GRADING_SCALE",
            option_id: ids.scale,
          }),
          expect.objectContaining({
            option_type: "RANKING_RULE",
            option_id: ids.rule,
          }),
        ]),
      );
    });
    it("stores the exact selected grading and ranking rule IDs", async () => {
      const r = await query(
        "select grading_scale_id, ranking_rule_id, aggregate_classification_scale_id from public.result_calculation_runs where id=$1",
        [runId],
      );
      expect(r.rows[0]).toMatchObject({
        grading_scale_id: ids.scale,
        ranking_rule_id: ids.rule,
        aggregate_classification_scale_id: null,
      });
    });
    it("produces deterministic class positions", async () => {
      const r = await query(
        "select count(*)::int count from public.calculated_student_results where calculation_run_id=$1 and class_position is not null",
        [runId],
      );
      expect(r.rows[0].count).toBe(4);
    });
    it("produces deterministic grade-wide positions", async () => {
      const r = await query(
        "select count(*)::int count from public.calculated_student_results where calculation_run_id=$1 and grade_level_position is not null",
        [runId],
      );
      expect(r.rows[0].count).toBe(4);
    });
    it("keeps each subject rank within its class section", async () => {
      const r = await query(
        "select count(*)::int count from public.calculated_subject_results where calculation_run_id=$1 and subject_position is not null",
        [runId],
      );
      expect(r.rows[0].count).toBe(7);
    });
    it("records absent attendance without inventing a score", async () => {
      const r = await query(
        "select attendance_status, entered_score, included_weight from public.calculated_component_explanations where calculation_run_id=$1 and enrollment_id=$2 and subject_id=$3",
        [runId, ids.enrollmentD, ids.subjectA],
      );
      expect(r.rows[0]).toMatchObject({
        attendance_status: "ABSENT",
        entered_score: null,
        included_weight: "100.00",
      });
    });
    it("records exempted attendance semantics", async () => {
      const r = await query(
        "select has_exemption, subject_score from public.calculated_subject_results where calculation_run_id=$1 and enrollment_id=$2 and subject_id=$3",
        [runId, ids.enrollmentA, ids.subjectC],
      );
      expect(r.rows[0]).toMatchObject({
        has_exemption: true,
        subject_score: null,
      });
    });
    it("does not aggregate a learner with an incomplete required subject", async () => {
      const r = await query(
        "select aggregate_total, aggregate_classification, is_complete from public.calculated_student_results where calculation_run_id=$1 and enrollment_id=$2",
        [runId, ids.enrollmentB],
      );
      expect(r.rows[0]).toMatchObject({
        aggregate_total: null,
        aggregate_classification: null,
        is_complete: false,
      });
    });
    it("persists the exact curriculum source manifest", async () => {
      const r = await query(
        "select count(*)::int count, count(distinct mark_sheet_id)::int distinct_count from public.result_calculation_sources where calculation_run_id=$1",
        [runId],
      );
      expect(r.rows[0]).toMatchObject({ count: 6, distinct_count: 6 });
    });
    it("writes one calculation audit event for the created run", async () => {
      const r = await query(
        "select count(*)::int count from public.audit_logs where entity_type='result_calculation_run' and entity_id=$1 and action='RESULT_CALCULATION_CREATED'",
        [runId],
      );
      expect(r.rows[0].count).toBe(1);
    });
    it("does not add an audit event during idempotent reuse", async () => {
      const r = await query(
        "select count(*)::int count from public.audit_logs where entity_type='result_calculation_run' and action='RESULT_CALCULATION_CREATED' and new_values->>'term_id'=$1",
        [ids.term],
      );
      expect(r.rows[0].count).toBe(1);
    });
    it("does not expose guardian or contact fields in student results", async () => {
      const r = await client.rpc("list_calculated_student_results", {
        target_run_id: runId,
      });
      expect(r.error).toBeNull();
      const keys = Object.keys(r.data?.[0] ?? {});
      expect(
        keys.some((key) => /guardian|contact|phone|email/i.test(key)),
      ).toBe(false);
    });
    it("keeps readiness checksum bound to the stored run rules", async () => {
      const readiness = await client.rpc("get_results_calculation_readiness", {
        target_term_id: ids.term,
        target_grade_level_id: ids.grade,
      });
      const stored = await query(
        "select input_checksum from public.result_calculation_runs where id=$1",
        [runId],
      );
      expect(readiness.error).toBeNull();
      expect(readiness.data?.[0]?.current_authoritative_input_checksum).toBe(
        stored.rows[0].input_checksum,
      );
    });
    it("serializes concurrent identical calculation requests", async () => {
      const requests = await Promise.all(
        [1, 2].map(() =>
          client.rpc("calculate_grade_results", {
            target_term_id: ids.term,
            target_grade_level_id: ids.grade,
            target_grading_scale_id: ids.scale,
            target_ranking_rule_id: ids.rule,
            target_aggregate_classification_scale_id: null,
          }),
        ),
      );
      expect(requests.every((request) => request.error === null)).toBe(true);
      expect(
        requests.every(
          (request) => request.data?.[0]?.calculation_run_id === runId,
        ),
      ).toBe(true);
    });
    it("keeps a single run after concurrent reuse", async () => {
      const r = await query(
        "select count(*)::int count from public.result_calculation_runs where term_id=$1 and grade_level_id=$2",
        [ids.term, ids.grade],
      );
      expect(r.rows[0].count).toBe(1);
    });
    it.each([
      ["total", "TOTAL"],
      ["average", "AVERAGE"],
      ["aggregate", "AGGREGATE"],
      ["configured-total", "TOTAL"],
      ["configured-average", "AVERAGE"],
      ["configured-aggregate", "AGGREGATE"],
    ] as const)("executes the %s ranking basis", async (name, metric) => {
      const fixture = policyFixtures[name];
      const result = await client.rpc("calculate_grade_results", {
        target_term_id: fixture.term,
        target_grade_level_id: fixture.grade,
        target_grading_scale_id: fixture.scale,
        target_ranking_rule_id: fixture.rule,
        target_aggregate_classification_scale_id: null,
      });
      expect(result.error).toBeNull();
      const rows = await query(
        "select result.ranking_metric::text, result.overall_total::text, result.overall_average::text, result.aggregate_total from public.calculated_student_results result join public.enrollments enrollment on enrollment.id=result.enrollment_id join public.students student on student.id=enrollment.student_id where result.calculation_run_id=$1 order by student.admission_number, result.enrollment_id",
        [result.data?.[0]?.calculation_run_id],
      );
      expect(rows.rows).toHaveLength(4);
      for (const row of rows.rows) {
        if (metric === "TOTAL")
          expect(row.ranking_metric).toBe(row.overall_total);
        if (metric === "AVERAGE")
          expect(row.ranking_metric).toBe(row.overall_average);
        if (metric === "AGGREGATE")
          expect(Number(row.ranking_metric)).toBe(Number(row.aggregate_total));
      }
    });
    it("persists PostgreSQL rounding boundaries consistently across score, grade, aggregate points, and ranking metric", async () => {
      const fixture = acceptanceFixtures.rounding;
      const result = await client.rpc("calculate_grade_results", {
        target_term_id: fixture.term,
        target_grade_level_id: fixture.grade,
        target_grading_scale_id: fixture.scale,
        target_ranking_rule_id: fixture.rule,
        target_aggregate_classification_scale_id: null,
      });
      expect(result.error).toBeNull();
      const rows = await query(
        "with one_subject as (select distinct on (subject.enrollment_id) subject.enrollment_id, subject.subject_score::text, subject.grade, subject.aggregate_points, student.ranking_metric::text from public.calculated_subject_results subject join public.calculated_student_results student on student.calculation_run_id=subject.calculation_run_id and student.enrollment_id=subject.enrollment_id where subject.calculation_run_id=$1 and subject.subject_score is not null order by subject.enrollment_id, subject.subject_id) select subject_score, grade, aggregate_points, ranking_metric from one_subject order by subject_score, enrollment_id",
        [result.data?.[0]?.calculation_run_id],
      );
      expect(rows.rows.slice(0, 3)).toEqual([
        {
          subject_score: "89.99",
          grade: "A",
          aggregate_points: 3,
          ranking_metric: "89.99",
        },
        {
          subject_score: "90.00",
          grade: "A",
          aggregate_points: 3,
          ranking_metric: "90.00",
        },
        {
          subject_score: "90.00",
          grade: "A",
          aggregate_points: 3,
          ranking_metric: "90.00",
        },
      ]);
    });
    it("maps valid aggregate totals and exact classification boundaries through the calculation RPC", async () => {
      const fixture = acceptanceFixtures.classification;
      const result = await client.rpc("calculate_grade_results", {
        target_term_id: fixture.term,
        target_grade_level_id: fixture.grade,
        target_grading_scale_id: fixture.scale,
        target_ranking_rule_id: fixture.rule,
        target_aggregate_classification_scale_id:
          acceptanceClassificationScales.valid,
      });
      expect(result.error).toBeNull();
      const rows = await query(
        "select aggregate_total, aggregate_classification from public.calculated_student_results where calculation_run_id=$1 order by aggregate_total",
        [result.data?.[0]?.calculation_run_id],
      );
      expect(rows.rows).toEqual([
        { aggregate_total: 3, aggregate_classification: "Alpha" },
        { aggregate_total: 9, aggregate_classification: "Beta" },
        { aggregate_total: 9, aggregate_classification: "Beta" },
        { aggregate_total: 9, aggregate_classification: "Beta" },
      ]);
    });
    it("rejects an unmatched aggregate classification without creating a run or success audit", async () => {
      const fixture = acceptanceFixtures.classificationUnmatched;
      const before = await query(
        "select count(*)::int as runs, (select count(*)::int from public.audit_logs where action='RESULT_CALCULATION_CREATED' and new_values->>'term_id'=$1) as audits from public.result_calculation_runs where term_id=$1 and grade_level_id=$2",
        [fixture.term, fixture.grade],
      );
      const result = await client.rpc("calculate_grade_results", {
        target_term_id: fixture.term,
        target_grade_level_id: fixture.grade,
        target_grading_scale_id: fixture.scale,
        target_ranking_rule_id: fixture.rule,
        target_aggregate_classification_scale_id:
          acceptanceClassificationScales.unmatched,
      });
      expect(result.error?.message).toContain(
        "RESULT_CLASSIFICATION_UNMATCHED",
      );
      const after = await query(
        "select count(*)::int as runs, (select count(*)::int from public.audit_logs where action='RESULT_CALCULATION_CREATED' and new_values->>'term_id'=$1) as audits from public.result_calculation_runs where term_id=$1 and grade_level_id=$2",
        [fixture.term, fixture.grade],
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
      expect(
        await query(
          "select count(*)::int as count from public.calculated_student_results where calculation_run_id in (select id from public.result_calculation_runs where term_id=$1 and grade_level_id=$2)",
          [fixture.term, fixture.grade],
        ),
      ).toMatchObject({ rows: [{ count: 0 }] });
    });
    it("rejects overlapping classification bands at the database boundary", async () => {
      const scale = randomUUID();
      await query(
        "insert into public.aggregate_classification_scales(id,school_id,name,version,is_active,created_by) values($1,$2,$3,1,false,$4)",
        [scale, ids.school, `Overlap ${scale}`, ids.membership],
      );
      await query(
        "insert into public.aggregate_classification_bands(scale_id,minimum_aggregate,maximum_aggregate,label,sort_order) values($1,0,5,'Alpha',1)",
        [scale],
      );
      await expect(
        query(
          "insert into public.aggregate_classification_bands(scale_id,minimum_aggregate,maximum_aggregate,label,sort_order) values($1,5,10,'Beta',2)",
          [scale],
        ),
      ).rejects.toThrow();
    });
    it("does not calculate a partial aggregate for incomplete or exempted contributing subjects", async () => {
      const fixture = acceptanceFixtures.partial;
      const result = await client.rpc("calculate_grade_results", {
        target_term_id: fixture.term,
        target_grade_level_id: fixture.grade,
        target_grading_scale_id: fixture.scale,
        target_ranking_rule_id: fixture.rule,
        target_aggregate_classification_scale_id: null,
      });
      expect(result.error).toBeNull();
      const rows = await query(
        "select enrollment_id, aggregate_total, aggregate_classification, is_complete from public.calculated_student_results where calculation_run_id=$1 order by enrollment_id",
        [result.data?.[0]?.calculation_run_id],
      );
      expect(rows.rows).toHaveLength(4);
      expect(rows.rows.filter((row) => row.aggregate_total === 9)).toHaveLength(
        2,
      );
      expect(
        rows.rows.filter((row) => row.aggregate_total === null),
      ).toHaveLength(2);
      expect(
        rows.rows.find((row) => row.enrollment_id === fixture.enrollments[1]),
      ).toMatchObject({
        aggregate_total: null,
        aggregate_classification: null,
        is_complete: false,
      });
      expect(
        rows.rows.find((row) => row.enrollment_id === fixture.enrollments[2]),
      ).toMatchObject({
        aggregate_total: null,
        aggregate_classification: null,
        is_complete: true,
      });
    });
    it("fails atomically when a complete aggregate-contributing subject has no aggregate points", async () => {
      const fixture = acceptanceFixtures.missingPoints;
      const result = await client.rpc("calculate_grade_results", {
        target_term_id: fixture.term,
        target_grade_level_id: fixture.grade,
        target_grading_scale_id: fixture.scale,
        target_ranking_rule_id: fixture.rule,
        target_aggregate_classification_scale_id: null,
      });
      expect(result.error?.message).toContain("RESULT_GRADING_BAND_MISSING");
      const runs = await query(
        "select count(*)::int as count from public.result_calculation_runs where term_id=$1 and grade_level_id=$2",
        [fixture.term, fixture.grade],
      );
      expect(runs.rows[0].count).toBe(0);
      const audit = await query(
        "select count(*)::int as count from public.audit_logs where action='RESULT_CALCULATION_CREATED' and new_values->>'term_id'=$1",
        [fixture.term],
      );
      expect(audit.rows[0].count).toBe(0);
    });
    it.each([
      ["dense", [1, 2, 2, 3]],
      ["competition", [1, 2, 2, 4]],
      ["shared", [1, 2, 2, 4]],
    ] as const)("applies the %s tie method", async (name, expected) => {
      const fixture = policyFixtures[`tie-${name}`];
      const result = await client.rpc("calculate_grade_results", {
        target_term_id: fixture.term,
        target_grade_level_id: fixture.grade,
        target_grading_scale_id: fixture.scale,
        target_ranking_rule_id: fixture.rule,
        target_aggregate_classification_scale_id: null,
      });
      expect(result.error).toBeNull();
      const rows = await query(
        "select class_position, class_tie_size, class_is_tied from public.calculated_student_results where calculation_run_id=$1 order by overall_average desc, enrollment_id",
        [result.data?.[0]?.calculation_run_id],
      );
      expect(rows.rows.map((row) => row.class_position)).toEqual(expected);
      expect(
        rows.rows.slice(1, 3).every((row) => row.class_tie_size === 2),
      ).toBe(true);
      expect(rows.rows.slice(1, 3).every((row) => row.class_is_tied)).toBe(
        true,
      );
    });
    it("uses normalized admission numbers before enrollment UUIDs for ORDINAL class, grade, and subject positions", async () => {
      const fixture = policyFixtures["tie-ordinal"];
      const result = await client.rpc("calculate_grade_results", {
        target_term_id: fixture.term,
        target_grade_level_id: fixture.grade,
        target_grading_scale_id: fixture.scale,
        target_ranking_rule_id: fixture.rule,
        target_aggregate_classification_scale_id: null,
      });
      expect(result.error).toBeNull();
      const rows = await query(
        "select student.admission_number, result.class_position, result.grade_level_position, min(subject.subject_position) as subject_position from public.calculated_student_results result join public.enrollments enrollment on enrollment.id=result.enrollment_id join public.students student on student.id=enrollment.student_id join public.calculated_subject_results subject on subject.calculation_run_id=result.calculation_run_id and subject.enrollment_id=result.enrollment_id where result.calculation_run_id=$1 group by student.admission_number, result.class_position, result.grade_level_position, result.enrollment_id order by result.class_position, min(subject.subject_position), result.enrollment_id limit 4",
        [result.data?.[0]?.calculation_run_id],
      );
      expect(rows.rows[0].admission_number).toBe(fixture.admissions[0]);
      expect(rows.rows[0].class_position).toBe(1);
      expect(rows.rows[0].grade_level_position).toBe(1);
      expect(rows.rows[0].subject_position).toBe(1);
      expect(rows.rows[1].admission_number).toBe(fixture.admissions[1]);
      expect(rows.rows[1].class_position).toBe(2);
      expect(rows.rows[2].admission_number).toBe(fixture.admissions[2]);
      expect(rows.rows[2].class_position).toBe(3);
    });
    it("preserves the accepted component attendance matrix", async () => {
      const fixture = componentFixture!;
      const result = await client.rpc("calculate_grade_results", {
        target_term_id: fixture.term,
        target_grade_level_id: fixture.grade,
        target_grading_scale_id: fixture.scale,
        target_ranking_rule_id: fixture.rule,
        target_aggregate_classification_scale_id: null,
      });
      expect(result.error).toBeNull();
      fixture.runId = result.data?.[0]?.calculation_run_id ?? "";
      const rows = await query(
        "select subject_id, subject_status, subject_score::text, grade, has_absence, has_exemption, assessed_weight::text, subject_position from public.calculated_subject_results where calculation_run_id=$1",
        [fixture.runId],
      );
      const byKey = (key: string) =>
        rows.rows.find((row) => row.subject_id === fixture.subjects[key]);
      expect(byKey("zero")).toMatchObject({
        subject_status: "COMPLETE",
        subject_score: "0.00",
        grade: "F",
        has_absence: false,
        has_exemption: false,
      });
      expect(byKey("absent")).toMatchObject({
        subject_status: "COMPLETE",
        subject_score: "32.00",
        has_absence: true,
        assessed_weight: "100.00",
      });
      expect(byKey("exempted")).toMatchObject({
        subject_status: "COMPLETE",
        subject_score: "80.00",
        has_exemption: true,
        assessed_weight: "40.00",
      });
      expect(byKey("optional-na")).toMatchObject({
        subject_status: "COMPLETE",
        subject_score: "75.00",
      });
      expect(byKey("missing-optional")).toMatchObject({
        subject_status: "COMPLETE",
        subject_score: "75.00",
      });
      expect(byKey("required-na")).toMatchObject({
        subject_status: "INCOMPLETE",
        subject_score: null,
        grade: null,
        subject_position: null,
      });
      expect(byKey("all-exempted")).toMatchObject({
        subject_status: "EXEMPTED",
        subject_score: null,
        grade: null,
        subject_position: null,
      });
    });
  },
);
