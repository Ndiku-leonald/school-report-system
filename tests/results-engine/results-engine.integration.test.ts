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
    "rule",
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
    it("reports one applicable grading scale", async () => {
      const r = await client.rpc("get_results_calculation_readiness", {
        target_term_id: ids.term,
        target_grade_level_id: ids.grade,
      });
      expect(r.data?.[0]?.applicable_grading_scale_count).toBe(1);
    });
    it("reports one applicable ranking rule", async () => {
      const r = await client.rpc("get_results_calculation_readiness", {
        target_term_id: ids.term,
        target_grade_level_id: ids.grade,
      });
      expect(r.data?.[0]?.applicable_ranking_rule_count).toBe(1);
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
  },
);
