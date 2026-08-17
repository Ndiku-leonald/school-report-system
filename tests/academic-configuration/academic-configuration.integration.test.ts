import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/types/database.generated";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL!;
const password = "synthetic-academic-configuration-password";
const nonce = Date.now();
const schoolId = randomUUID();
const otherSchoolId = randomUUID();
const database = new Client({ connectionString: databaseUrl });
const admin = createClient<Database>(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});

type Role = Database["public"]["Enums"]["staff_role"];
type ClientType = SupabaseClient<Database>;
type Entity = { entity_id: string; entity_status: string; updated_at: string };

const identities = new Map<
  string,
  { email: string; membershipId: string; userId: string }
>();
const state: Record<string, Entity> = {};
let registrar: ClientType;
let registrarOtherMembershipId: string;

const assessmentComponents = [
  {
    name: "Coursework",
    component_code: "CW",
    maximum_score: 100,
    weight_percentage: 100,
    sort_order: 1,
    is_required: true,
  },
];
const gradingBands = [
  {
    minimum_score: 0,
    maximum_score: 50,
    grade: "F",
    aggregate_points: 2,
    description: "Below threshold",
    is_pass: false,
    sort_order: 1,
  },
  {
    minimum_score: 50,
    maximum_score: 100,
    grade: "P",
    aggregate_points: 1,
    description: "Pass",
    is_pass: true,
    sort_order: 2,
  },
];
const rankingConfiguration = {
  schema_version: 1,
  direction: "DESC",
  include_incomplete: false,
  minimum_subjects: 1,
};
const promotionConfiguration = {
  schema_version: 1,
  require_all_required_subjects: true,
  allow_manual_review: true,
};

function entity(data: Entity[] | null) {
  expect(data).toHaveLength(1);
  return data![0]!;
}

async function createIdentity(key: string, role: Role) {
  const email = `academic.${key}.${nonce}@example.invalid`;
  const auth = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  const userId = auth.data.user.id;
  const membershipId = randomUUID();
  await database.query(
    `insert into public.profiles (id, first_name, last_name)
     values ($1, 'Synthetic', 'Configuration')`,
    [userId],
  );
  await database.query(
    `insert into public.school_staff_memberships
       (id, school_id, profile_id, employee_number, status)
     values ($1, $2, $3, $4, 'ACTIVE')`,
    [membershipId, schoolId, userId, `CFG-${key}-${nonce}`],
  );
  await database.query(
    `insert into public.staff_role_assignments (membership_id, role)
     values ($1, $2)`,
    [membershipId, role],
  );
  identities.set(key, { email, membershipId, userId });
}

async function signedIn(key: string) {
  const identity = identities.get(key)!;
  const client = createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const login = await client.auth.signInWithPassword({
    email: identity.email,
    password,
  });
  if (login.error) throw login.error;
  const selection = await client.rpc("set_my_active_membership", {
    target_membership_id: identity.membershipId,
  });
  if (selection.error) throw selection.error;
  return client;
}

describe.sequential("local academic configuration workflows", () => {
  beforeAll(async () => {
    await database.connect();
    await database.query(
      `insert into public.schools (id, name, slug, school_code)
       values
         ($1, 'Synthetic Configuration School', $2, $3),
         ($4, 'Synthetic Other Configuration School', $5, $6)`,
      [
        schoolId,
        `synthetic-configuration-${nonce}`,
        `CFG-${nonce}`,
        otherSchoolId,
        `synthetic-other-configuration-${nonce}`,
        `CFG-OTHER-${nonce}`,
      ],
    );
    await createIdentity("admin", "SCHOOL_ADMIN");
    await createIdentity("registrar", "ACADEMIC_REGISTRAR");
    await createIdentity("head", "HEAD_TEACHER");
    await createIdentity("subject", "SUBJECT_TEACHER");

    const registrarIdentity = identities.get("registrar")!;
    registrarOtherMembershipId = randomUUID();
    await database.query(
      `insert into public.school_staff_memberships
         (id, school_id, profile_id, employee_number, status)
       values ($1, $2, $3, $4, 'ACTIVE')`,
      [
        registrarOtherMembershipId,
        otherSchoolId,
        registrarIdentity.userId,
        `CFG-OTHER-REG-${nonce}`,
      ],
    );
    await database.query(
      `insert into public.staff_role_assignments (membership_id, role)
       values ($1, 'ACADEMIC_REGISTRAR')`,
      [registrarOtherMembershipId],
    );
    registrar = await signedIn("registrar");
  });

  afterAll(async () => {
    await database.end();
  });

  it.each([
    ["admin", true],
    ["registrar", true],
    ["head", false],
    ["subject", false],
  ])(
    "%s receives the expected configuration permissions",
    async (key, manage) => {
      const client = await signedIn(key);
      const permissions = await client.rpc("get_my_effective_permissions", {
        target_membership_id: identities.get(key)!.membershipId,
      });
      expect(permissions.error).toBeNull();
      expect(permissions.data).toContain("ACADEMIC_CONFIGURATION_VIEW");
      expect(permissions.data?.includes("ACADEMIC_CONFIGURATION_MANAGE")).toBe(
        manage,
      );
    },
  );

  it("creates and edits a draft academic year", async () => {
    const created = await registrar.rpc("create_academic_year", {
      year_name: `Synthetic ${nonce}`,
      year_starts_on: "2030-01-01",
      year_ends_on: "2030-12-31",
    });
    expect(created.error).toBeNull();
    state.year = entity(created.data);

    const updated = await registrar.rpc("update_academic_year", {
      target_year_id: state.year.entity_id,
      expected_updated_at: state.year.updated_at,
      year_name: `Synthetic edited ${nonce}`,
      year_starts_on: "2030-01-01",
      year_ends_on: "2030-12-31",
    });
    expect(updated.error).toBeNull();
    state.year = entity(updated.data);
  });

  it("creates and edits a draft term", async () => {
    const created = await registrar.rpc("create_term", {
      target_academic_year_id: state.year.entity_id,
      term_name: "Term One",
      target_term_number: 1,
      term_starts_on: "2030-01-01",
      term_ends_on: "2030-06-30",
      promotion_term: false,
    });
    expect(created.error).toBeNull();
    state.term = entity(created.data);

    const updated = await registrar.rpc("update_term", {
      target_term_id: state.term.entity_id,
      expected_updated_at: state.term.updated_at,
      term_name: "Term One edited",
      target_term_number: 1,
      term_starts_on: "2030-01-01",
      term_ends_on: "2030-06-30",
      promotion_term: false,
    });
    expect(updated.error).toBeNull();
    state.term = entity(updated.data);
  });

  it("creates, edits, and atomically reorders grade levels", async () => {
    for (const [key, code, name, order] of [
      ["grade", "P1", "Primary One", 1],
      ["gradeTwo", "P2", "Primary Two", 2],
    ] as const) {
      const result = await registrar.rpc("create_grade_level", {
        grade_code: `${code}${nonce}`,
        grade_name: name,
        grade_sort_order: order,
        grade_is_final: false,
      });
      expect(result.error).toBeNull();
      state[key] = entity(result.data);
    }
    const edited = await registrar.rpc("update_grade_level", {
      target_grade_level_id: state.grade.entity_id,
      expected_updated_at: state.grade.updated_at,
      grade_code: `P1E${nonce}`,
      grade_name: "Primary One edited",
      grade_sort_order: 1,
      grade_is_final: false,
    });
    expect(edited.error).toBeNull();
    state.grade = entity(edited.data);

    const reordered = await registrar.rpc("reorder_grade_levels", {
      ordered_grades: [
        {
          id: state.grade.entity_id,
          sort_order: 2,
          expected_updated_at: state.grade.updated_at,
        },
        {
          id: state.gradeTwo.entity_id,
          sort_order: 1,
          expected_updated_at: state.gradeTwo.updated_at,
        },
      ],
    });
    expect(reordered.error).toBeNull();
    for (const row of reordered.data ?? []) {
      if (row.entity_id === state.grade.entity_id) state.grade = row;
      if (row.entity_id === state.gradeTwo.entity_id) state.gradeTwo = row;
    }
  });

  it("creates, edits, and atomically reorders subjects", async () => {
    for (const [key, code, name, order] of [
      ["subjectOne", "ENG", "English", 1],
      ["subjectTwo", "MTH", "Mathematics", 2],
    ] as const) {
      const result = await registrar.rpc("create_subject", {
        subject_code: `${code}${nonce}`,
        subject_name: name,
        subject_description: "Synthetic integration fixture",
        subject_is_core: true,
        subject_contributes_to_aggregate: true,
        subject_sort_order: order,
      });
      expect(result.error).toBeNull();
      state[key] = entity(result.data);
    }
    const edited = await registrar.rpc("update_subject", {
      target_subject_id: state.subjectOne.entity_id,
      expected_updated_at: state.subjectOne.updated_at,
      subject_code: `ENGE${nonce}`,
      subject_name: "English edited",
      subject_description: "Edited fixture",
      subject_is_core: true,
      subject_contributes_to_aggregate: true,
      subject_sort_order: 1,
    });
    expect(edited.error).toBeNull();
    state.subjectOne = entity(edited.data);

    const reordered = await registrar.rpc("reorder_subjects", {
      ordered_subjects: [
        {
          id: state.subjectOne.entity_id,
          sort_order: 2,
          expected_updated_at: state.subjectOne.updated_at,
        },
        {
          id: state.subjectTwo.entity_id,
          sort_order: 1,
          expected_updated_at: state.subjectTwo.updated_at,
        },
      ],
    });
    expect(reordered.error).toBeNull();
    for (const row of reordered.data ?? []) {
      if (row.entity_id === state.subjectOne.entity_id) state.subjectOne = row;
      if (row.entity_id === state.subjectTwo.entity_id) state.subjectTwo = row;
    }
  });

  it("edits an unused class but rejects scope changes after dependency use", async () => {
    const created = await registrar.rpc("create_class_section", {
      target_academic_year_id: state.year.entity_id,
      target_grade_level_id: state.grade.entity_id,
      section_name: "Blue",
      section_code: `BLUE-${nonce}`,
      section_capacity: 40,
    });
    expect(created.error).toBeNull();
    state.section = entity(created.data);

    const edited = await registrar.rpc("update_class_section", {
      target_class_section_id: state.section.entity_id,
      expected_updated_at: state.section.updated_at,
      target_academic_year_id: state.year.entity_id,
      target_grade_level_id: state.grade.entity_id,
      section_name: "Blue edited",
      section_code: `BLUE-E-${nonce}`,
      section_capacity: 45,
    });
    expect(edited.error).toBeNull();
    state.section = entity(edited.data);

    await database.query(
      `insert into public.teaching_assignments
         (term_id, class_section_id, subject_id, staff_membership_id, starts_on)
       values ($1, $2, $3, $4, '2030-01-01')`,
      [
        state.term.entity_id,
        state.section.entity_id,
        state.subjectOne.entity_id,
        identities.get("subject")!.membershipId,
      ],
    );
    const moved = await registrar.rpc("update_class_section", {
      target_class_section_id: state.section.entity_id,
      expected_updated_at: state.section.updated_at,
      target_academic_year_id: state.year.entity_id,
      target_grade_level_id: state.gradeTwo.entity_id,
      section_name: "Forbidden move",
      section_code: `BLUE-E-${nonce}`,
      section_capacity: 45,
    });
    expect(moved.error?.message).toContain(
      "ACADEMIC_CONFIGURATION_CLASS_SCOPE_IN_USE",
    );
  });

  it("edits mapping flags while keeping grade-subject identity immutable", async () => {
    const created = await registrar.rpc("create_grade_level_subject", {
      target_grade_level_id: state.grade.entity_id,
      target_subject_id: state.subjectOne.entity_id,
      mapping_required: true,
      mapping_contributes_to_aggregate: true,
      mapping_sort_order: 1,
    });
    expect(created.error).toBeNull();
    state.mapping = entity(created.data);

    const edited = await registrar.rpc("update_grade_level_subject", {
      target_mapping_id: state.mapping.entity_id,
      expected_updated_at: state.mapping.updated_at,
      mapping_required: false,
      mapping_contributes_to_aggregate: true,
      mapping_sort_order: 1,
    });
    expect(edited.error).toBeNull();
    state.mapping = entity(edited.data);

    const forged = await registrar.rpc("set_grade_level_subject", {
      target_mapping_id: state.mapping.entity_id,
      expected_updated_at: state.mapping.updated_at,
      target_grade_level_id: state.gradeTwo.entity_id,
      target_subject_id: state.subjectTwo.entity_id,
      mapping_required: true,
      mapping_contributes_to_aggregate: true,
      mapping_sort_order: 1,
    });
    expect(forged.error).not.toBeNull();
  });

  it("edits assessment drafts and versions active records without overwrite", async () => {
    const created = await registrar.rpc("save_assessment_scheme_draft", {
      target_scheme_id: null as unknown as string,
      expected_updated_at: null as unknown as string,
      target_term_id: state.term.entity_id,
      target_grade_level_id: state.grade.entity_id,
      target_subject_id: state.subjectOne.entity_id,
      scheme_name: "Assessment draft",
      scheme_effective_from: "2030-01-01",
      scheme_components: assessmentComponents,
    });
    expect(created.error).toBeNull();
    state.assessment = entity(created.data);
    const edited = await registrar.rpc("save_assessment_scheme_draft", {
      target_scheme_id: state.assessment.entity_id,
      expected_updated_at: state.assessment.updated_at,
      target_term_id: state.term.entity_id,
      target_grade_level_id: state.grade.entity_id,
      target_subject_id: state.subjectOne.entity_id,
      scheme_name: "Assessment draft edited",
      scheme_effective_from: "2030-01-01",
      scheme_components: assessmentComponents,
    });
    expect(edited.error).toBeNull();
    expect(entity(edited.data).entity_id).toBe(state.assessment.entity_id);
    state.assessment = entity(edited.data);

    const activated = await registrar.rpc("activate_assessment_scheme", {
      target_scheme_id: state.assessment.entity_id,
      expected_updated_at: state.assessment.updated_at,
    });
    expect(activated.error).toBeNull();
    state.assessment = entity(activated.data);
    const version = await registrar.rpc("create_assessment_scheme_version", {
      source_scheme_id: state.assessment.entity_id,
      expected_updated_at: state.assessment.updated_at,
      scheme_name: "Assessment version two",
      scheme_effective_from: "2030-01-01",
      scheme_components: assessmentComponents,
    });
    expect(version.error).toBeNull();
    expect(entity(version.data).entity_id).not.toBe(state.assessment.entity_id);
    state.assessmentVersion = entity(version.data);
    const retired = await registrar.rpc("retire_assessment_scheme", {
      target_scheme_id: state.assessment.entity_id,
      expected_updated_at: state.assessment.updated_at,
    });
    expect(retired.error).toBeNull();
    expect(entity(retired.data).entity_status).toBe("RETIRED");
  });

  it("preserves existing mark-sheet workflow continuity after scheme retirement", async () => {
    const activated = await registrar.rpc("activate_assessment_scheme", {
      target_scheme_id: state.assessmentVersion.entity_id,
      expected_updated_at: state.assessmentVersion.updated_at,
    });
    expect(activated.error).toBeNull();
    state.assessmentVersion = entity(activated.data);

    const assignment = await database.query<{ id: string }>(
      `select id
       from public.teaching_assignments
       where term_id = $1
         and class_section_id = $2
         and subject_id = $3
         and staff_membership_id = $4`,
      [
        state.term.entity_id,
        state.section.entity_id,
        state.subjectOne.entity_id,
        identities.get("subject")!.membershipId,
      ],
    );
    expect(assignment.rows).toHaveLength(1);

    const schemeDefinitionBefore = await database.query(
      `select term_id, grade_level_id, subject_id, name, version,
              effective_from, created_by
       from public.assessment_schemes
       where id = $1`,
      [state.assessmentVersion.entity_id],
    );
    const componentsBefore = await database.query(
      `select id, assessment_scheme_id, name, component_code, maximum_score,
              weight_percentage, sort_order, is_required, created_at, updated_at
       from public.assessment_components
       where assessment_scheme_id = $1
       order by sort_order`,
      [state.assessmentVersion.entity_id],
    );

    const sheetId = randomUUID();
    await expect(
      database.query(
        `insert into public.mark_sheets
           (id, term_id, class_section_id, subject_id,
            assessment_scheme_id, teaching_assignment_id)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          sheetId,
          state.term.entity_id,
          state.section.entity_id,
          state.subjectOne.entity_id,
          state.assessmentVersion.entity_id,
          assignment.rows[0]!.id,
        ],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });

    const retired = await registrar.rpc("retire_assessment_scheme", {
      target_scheme_id: state.assessmentVersion.entity_id,
      expected_updated_at: state.assessmentVersion.updated_at,
    });
    expect(retired.error).toBeNull();
    state.assessmentVersion = entity(retired.data);

    await expect(
      database.query(
        `insert into public.mark_sheets
           (term_id, class_section_id, subject_id, assessment_scheme_id,
            teaching_assignment_id, version)
         values ($1, $2, $3, $4, $5, 2)`,
        [
          state.term.entity_id,
          state.section.entity_id,
          state.subjectOne.entity_id,
          state.assessmentVersion.entity_id,
          assignment.rows[0]!.id,
        ],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      message: "A mark sheet must reference an active assessment scheme.",
    });

    await expect(
      database.query(
        `update public.mark_sheets
         set workflow_status = 'SUBMITTED',
             submitted_by = $2,
             submitted_at = now()
         where id = $1`,
        [sheetId, identities.get("subject")!.membershipId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });

    await expect(
      database.query(
        `update public.mark_sheets
         set assessment_scheme_id = $2
         where id = $1`,
        [sheetId, state.assessment.entity_id],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      message: "A mark sheet must reference an active assessment scheme.",
    });

    const schemeDefinitionAfter = await database.query(
      `select term_id, grade_level_id, subject_id, name, version,
              effective_from, created_by
       from public.assessment_schemes
       where id = $1`,
      [state.assessmentVersion.entity_id],
    );
    const componentsAfter = await database.query(
      `select id, assessment_scheme_id, name, component_code, maximum_score,
              weight_percentage, sort_order, is_required, created_at, updated_at
       from public.assessment_components
       where assessment_scheme_id = $1
       order by sort_order`,
      [state.assessmentVersion.entity_id],
    );
    expect(schemeDefinitionAfter.rows).toEqual(schemeDefinitionBefore.rows);
    expect(componentsAfter.rows).toEqual(componentsBefore.rows);
  });

  it("edits, activates, versions, and retires grading scales", async () => {
    const created = await registrar.rpc("save_grading_scale_draft", {
      target_scale_id: null as unknown as string,
      expected_updated_at: null as unknown as string,
      target_academic_year_id: state.year.entity_id,
      target_grade_level_id: state.grade.entity_id,
      scale_name: "Grading draft",
      scale_effective_from: "2030-01-01",
      scale_bands: gradingBands,
    });
    expect(created.error).toBeNull();
    state.grading = entity(created.data);
    const edited = await registrar.rpc("save_grading_scale_draft", {
      target_scale_id: state.grading.entity_id,
      expected_updated_at: state.grading.updated_at,
      target_academic_year_id: state.year.entity_id,
      target_grade_level_id: state.grade.entity_id,
      scale_name: "Grading draft edited",
      scale_effective_from: "2030-01-01",
      scale_bands: gradingBands,
    });
    expect(edited.error).toBeNull();
    state.grading = entity(edited.data);
    const activated = await registrar.rpc("activate_grading_scale", {
      target_scale_id: state.grading.entity_id,
      expected_updated_at: state.grading.updated_at,
    });
    expect(activated.error).toBeNull();
    state.grading = entity(activated.data);
    const version = await registrar.rpc("create_grading_scale_version", {
      source_scale_id: state.grading.entity_id,
      expected_updated_at: state.grading.updated_at,
      scale_name: "Grading version two",
      scale_effective_from: "2030-01-01",
      scale_bands: gradingBands,
    });
    expect(version.error).toBeNull();
    expect(entity(version.data).entity_id).not.toBe(state.grading.entity_id);
    const retired = await registrar.rpc("deactivate_grading_scale", {
      target_scale_id: state.grading.entity_id,
      expected_updated_at: state.grading.updated_at,
    });
    expect(retired.error).toBeNull();
    expect(entity(retired.data).entity_status).toBe("RETIRED");
  });

  it("edits and versions structured ranking and promotion rules", async () => {
    const ranking = await registrar.rpc("save_ranking_rule", {
      target_rule_id: null as unknown as string,
      expected_updated_at: null as unknown as string,
      target_academic_year_id: state.year.entity_id,
      target_grade_level_id: state.grade.entity_id,
      rule_name: "Ranking draft",
      rule_ranking_basis: "AVERAGE",
      rule_tie_method: "DENSE",
      rule_configuration: rankingConfiguration,
    });
    expect(ranking.error).toBeNull();
    state.ranking = entity(ranking.data);
    const rankingEdit = await registrar.rpc("save_ranking_rule", {
      target_rule_id: state.ranking.entity_id,
      expected_updated_at: state.ranking.updated_at,
      target_academic_year_id: state.year.entity_id,
      target_grade_level_id: state.grade.entity_id,
      rule_name: "Ranking draft edited",
      rule_ranking_basis: "AVERAGE",
      rule_tie_method: "DENSE",
      rule_configuration: rankingConfiguration,
    });
    expect(rankingEdit.error).toBeNull();
    state.ranking = entity(rankingEdit.data);
    state.ranking = entity(
      (
        await registrar.rpc("activate_ranking_rule", {
          target_rule_id: state.ranking.entity_id,
          expected_updated_at: state.ranking.updated_at,
        })
      ).data,
    );
    const rankingVersion = await registrar.rpc("create_ranking_rule_version", {
      source_rule_id: state.ranking.entity_id,
      expected_updated_at: state.ranking.updated_at,
      rule_name: "Ranking version two",
      rule_ranking_basis: "AVERAGE",
      rule_tie_method: "COMPETITION",
      rule_configuration: rankingConfiguration,
    });
    expect(rankingVersion.error).toBeNull();
    expect(entity(rankingVersion.data).entity_id).not.toBe(
      state.ranking.entity_id,
    );
    expect(
      (
        await registrar.rpc("deactivate_ranking_rule", {
          target_rule_id: state.ranking.entity_id,
          expected_updated_at: state.ranking.updated_at,
        })
      ).error,
    ).toBeNull();

    const requiredSubjects = [
      { subject_id: state.subjectOne.entity_id, minimum_score: 50 },
    ];
    const promotion = await registrar.rpc("save_promotion_rule", {
      target_rule_id: null as unknown as string,
      expected_updated_at: null as unknown as string,
      target_academic_year_id: state.year.entity_id,
      target_grade_level_id: state.grade.entity_id,
      rule_name: "Promotion draft",
      rule_minimum_average: 50,
      rule_maximum_aggregate: 30,
      rule_minimum_subjects_passed: 1,
      rule_minimum_attendance_percentage: 80,
      rule_required_subjects: requiredSubjects,
      rule_additional_configuration: promotionConfiguration,
    });
    expect(promotion.error).toBeNull();
    state.promotion = entity(promotion.data);
    const promotionEdit = await registrar.rpc("save_promotion_rule", {
      target_rule_id: state.promotion.entity_id,
      expected_updated_at: state.promotion.updated_at,
      target_academic_year_id: state.year.entity_id,
      target_grade_level_id: state.grade.entity_id,
      rule_name: "Promotion draft edited",
      rule_minimum_average: 52,
      rule_maximum_aggregate: 30,
      rule_minimum_subjects_passed: 1,
      rule_minimum_attendance_percentage: 80,
      rule_required_subjects: requiredSubjects,
      rule_additional_configuration: promotionConfiguration,
    });
    expect(promotionEdit.error).toBeNull();
    state.promotion = entity(promotionEdit.data);
    state.promotion = entity(
      (
        await registrar.rpc("activate_promotion_rule", {
          target_rule_id: state.promotion.entity_id,
          expected_updated_at: state.promotion.updated_at,
        })
      ).data,
    );
    const promotionVersion = await registrar.rpc(
      "create_promotion_rule_version",
      {
        source_rule_id: state.promotion.entity_id,
        expected_updated_at: state.promotion.updated_at,
        rule_name: "Promotion version two",
        rule_minimum_average: 55,
        rule_maximum_aggregate: 28,
        rule_minimum_subjects_passed: 1,
        rule_minimum_attendance_percentage: 82,
        rule_required_subjects: requiredSubjects,
        rule_additional_configuration: promotionConfiguration,
      },
    );
    expect(promotionVersion.error).toBeNull();
    expect(entity(promotionVersion.data).entity_id).not.toBe(
      state.promotion.entity_id,
    );
    expect(
      (
        await registrar.rpc("deactivate_promotion_rule", {
          target_rule_id: state.promotion.entity_id,
          expected_updated_at: state.promotion.updated_at,
        })
      ).error,
    ).toBeNull();
  });

  it("rejects no-op lifecycle requests without creating an audit event", async () => {
    const before = await database.query<{ count: string }>(
      `select count(*)::text as count
       from public.audit_logs
       where entity_id = $1`,
      [state.grade.entity_id],
    );
    const noOp = await registrar.rpc("set_grade_level_active", {
      target_grade_level_id: state.grade.entity_id,
      expected_updated_at: state.grade.updated_at,
      target_active: true,
    });
    expect(noOp.error?.message).toContain(
      "ACADEMIC_CONFIGURATION_LIFECYCLE_NO_CHANGE",
    );
    const after = await database.query<{ count: string }>(
      `select count(*)::text as count
       from public.audit_logs
       where entity_id = $1`,
      [state.grade.entity_id],
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it("rejects stale edits with an optimistic-concurrency conflict", async () => {
    const stale = await registrar.rpc("update_grade_level_subject", {
      target_mapping_id: state.mapping.entity_id,
      expected_updated_at: "2000-01-01T00:00:00.000Z",
      mapping_required: true,
      mapping_contributes_to_aggregate: true,
      mapping_sort_order: 1,
    });
    expect(stale.error?.message).toContain("ACADEMIC_CONFIGURATION_CONFLICT");
  });

  it("records distinct create, edit, version, activation, and retirement audits", async () => {
    const audits = await database.query<{
      action: string;
      entity_id: string;
      new_values: { source_record_id?: string } | null;
    }>(
      `select action, entity_id, new_values
       from public.audit_logs
       where entity_id = any($1::uuid[])`,
      [[state.assessment.entity_id, state.assessmentVersion.entity_id]],
    );
    const actions = audits.rows.map((row) => row.action);
    expect(actions).toContain("ACADEMIC_CONFIGURATION_CREATED");
    expect(actions).toContain("ACADEMIC_CONFIGURATION_UPDATED");
    expect(actions).toContain("ACADEMIC_CONFIGURATION_ACTIVATED");
    expect(actions).toContain("ACADEMIC_CONFIGURATION_RETIRED");
    const versionAudit = audits.rows.find(
      (row) => row.action === "ACADEMIC_CONFIGURATION_VERSION_CREATED",
    );
    expect(versionAudit?.new_values?.source_record_id).toBe(
      state.assessment.entity_id,
    );
  });

  it("isolates selected memberships across schools in the same auth session", async () => {
    const selection = await registrar.rpc("set_my_active_membership", {
      target_membership_id: registrarOtherMembershipId,
    });
    expect(selection.error).toBeNull();
    const otherYear = await registrar.rpc("create_academic_year", {
      year_name: `Other school ${nonce}`,
      year_starts_on: "2040-01-01",
      year_ends_on: "2040-12-31",
    });
    expect(otherYear.error).toBeNull();
    const otherVisible = await registrar
      .from("academic_years")
      .select("school_id");
    expect(
      otherVisible.data?.every((row) => row.school_id === otherSchoolId),
    ).toBe(true);

    await registrar.rpc("set_my_active_membership", {
      target_membership_id: identities.get("registrar")!.membershipId,
    });
    const primaryVisible = await registrar
      .from("academic_years")
      .select("school_id");
    expect(
      primaryVisible.data?.every((row) => row.school_id === schoolId),
    ).toBe(true);
    const forged = await registrar.rpc("update_academic_year", {
      target_year_id: entity(otherYear.data).entity_id,
      expected_updated_at: entity(otherYear.data).updated_at,
      year_name: "Forged cross-school edit",
      year_starts_on: "2040-01-01",
      year_ends_on: "2040-12-31",
    });
    expect(forged.error).not.toBeNull();
  });

  it.each(["head", "subject"])(
    "denies forged RPC and direct writes to the %s view-only role",
    async (key) => {
      const viewer = await signedIn(key);
      const rpc = await viewer.rpc("create_academic_year", {
        year_name: `Forged ${key}`,
        year_starts_on: "2041-01-01",
        year_ends_on: "2041-12-31",
      });
      expect(rpc.error).not.toBeNull();
      const direct = await viewer.from("subjects").insert({
        school_id: schoolId,
        code: `FORGED-${key}`,
        name: "Forged",
        sort_order: 99,
      });
      expect(direct.error).not.toBeNull();
    },
  );
});
