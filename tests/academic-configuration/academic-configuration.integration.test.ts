import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/types/database.generated";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL!;
const password = "synthetic-academic-configuration-password";
const nonce = Date.now();
const admin = createClient<Database>(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});
const database = new Client({ connectionString: databaseUrl });
const schoolId = randomUUID();
const users: string[] = [];
const identities = new Map<string, { email: string; membershipId: string }>();

type Role = Database["public"]["Enums"]["staff_role"];

async function createIdentity(key: string, role: Role) {
  const email = `academic.${key}.${nonce}@example.invalid`;
  const auth = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  const userId = auth.data.user!.id;
  const membershipId = randomUUID();
  users.push(userId);
  await database.query(
    `insert into public.profiles (id, first_name, last_name)
     values ($1, 'Synthetic', 'Configuration')
     on conflict (id) do update set first_name = excluded.first_name`,
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
  identities.set(key, { email, membershipId });
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

describe.sequential("local academic configuration RPCs", () => {
  beforeAll(async () => {
    await database.connect();
    await database.query(
      `insert into public.schools (id, name, slug, school_code)
       values ($1, 'Synthetic Configuration School', $2, $3)`,
      [schoolId, `synthetic-configuration-${nonce}`, `CFG-${nonce}`],
    );
    await createIdentity("admin", "SCHOOL_ADMIN");
    await createIdentity("registrar", "ACADEMIC_REGISTRAR");
    await createIdentity("head", "HEAD_TEACHER");
    await createIdentity("class", "CLASS_TEACHER");
    await createIdentity("subject", "SUBJECT_TEACHER");
  });

  afterAll(async () => {
    // Successful audit rows are append-only and retain actor references. The
    // disposable local reset owns fixture cleanup.
    await database.end();
  });

  it.each([
    ["admin", true],
    ["registrar", true],
    ["head", false],
    ["class", false],
    ["subject", false],
  ])("%s receives the expected manage capability", async (key, canManage) => {
    const client = await signedIn(key);
    const identity = identities.get(key)!;
    const permissions = await client.rpc("get_my_effective_permissions", {
      target_membership_id: identity.membershipId,
    });
    expect(permissions.error).toBeNull();
    expect(permissions.data).toContain("ACADEMIC_CONFIGURATION_VIEW");
    expect(permissions.data?.includes("ACADEMIC_CONFIGURATION_MANAGE")).toBe(
      canManage,
    );
  });

  it("creates, activates, audits, isolates, and rejects stale writes", async () => {
    const registrar = await signedIn("registrar");
    const created = await registrar.rpc("create_academic_year", {
      year_name: `Synthetic ${nonce}`,
      year_starts_on: "2030-01-01",
      year_ends_on: "2030-12-31",
    });
    expect(created.error).toBeNull();
    const year = created.data![0]!;

    const activated = await registrar.rpc("activate_academic_year", {
      target_year_id: year.entity_id,
      expected_updated_at: year.updated_at,
    });
    expect(activated.error).toBeNull();
    expect(activated.data?.[0]?.entity_status).toBe("ACTIVE");

    const term = await registrar.rpc("create_term", {
      target_academic_year_id: year.entity_id,
      term_name: "Synthetic Term",
      target_term_number: 1,
      term_starts_on: "2030-01-01",
      term_ends_on: "2030-06-30",
      promotion_term: false,
    });
    expect(term.error).toBeNull();

    const grade = await registrar.rpc("create_grade_level", {
      grade_code: "CFG1",
      grade_name: "Synthetic Grade",
      grade_sort_order: 1,
      grade_is_final: false,
    });
    expect(grade.error).toBeNull();

    const subject = await registrar.rpc("create_subject", {
      subject_code: "CFGS",
      subject_name: "Synthetic Subject",
      subject_description: "Local integration fixture",
      subject_is_core: true,
      subject_contributes_to_aggregate: true,
      subject_sort_order: 1,
    });
    expect(subject.error).toBeNull();

    const gradeId = grade.data![0]!.entity_id;
    const subjectId = subject.data![0]!.entity_id;
    const termId = term.data![0]!.entity_id;
    const section = await registrar.rpc("create_class_section", {
      target_academic_year_id: year.entity_id,
      target_grade_level_id: gradeId,
      section_name: "Synthetic Section",
      section_code: "CFG-SECTION",
      section_capacity: 40,
    });
    expect(section.error).toBeNull();

    const mapping = await registrar.rpc("set_grade_level_subject", {
      target_grade_level_id: gradeId,
      target_subject_id: subjectId,
      mapping_required: true,
      mapping_contributes_to_aggregate: true,
      mapping_sort_order: 1,
    });
    expect(mapping.error).toBeNull();

    const scheme = await registrar.rpc("save_assessment_scheme_draft", {
      target_scheme_id: null as unknown as string,
      expected_updated_at: null as unknown as string,
      target_term_id: termId,
      target_grade_level_id: gradeId,
      target_subject_id: subjectId,
      scheme_name: "Synthetic Scheme",
      scheme_effective_from: "2030-01-01",
      scheme_components: [
        {
          name: "Assessment",
          component_code: "ASSESS",
          maximum_score: 100,
          weight_percentage: 100,
          sort_order: 1,
          is_required: true,
        },
      ],
    });
    expect(scheme.error).toBeNull();
    const schemeActivation = await registrar.rpc("activate_assessment_scheme", {
      target_scheme_id: scheme.data![0]!.entity_id,
      expected_updated_at: scheme.data![0]!.updated_at,
    });
    expect(schemeActivation.error).toBeNull();

    const scale = await registrar.rpc("save_grading_scale_draft", {
      target_scale_id: null as unknown as string,
      expected_updated_at: null as unknown as string,
      target_academic_year_id: year.entity_id,
      target_grade_level_id: gradeId,
      scale_name: "Synthetic Scale",
      scale_effective_from: "2030-01-01",
      scale_bands: [
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
      ],
    });
    expect(scale.error).toBeNull();
    const scaleActivation = await registrar.rpc("activate_grading_scale", {
      target_scale_id: scale.data![0]!.entity_id,
      expected_updated_at: scale.data![0]!.updated_at,
    });
    expect(scaleActivation.error).toBeNull();

    const ranking = await registrar.rpc("save_ranking_rule", {
      target_rule_id: null as unknown as string,
      expected_updated_at: null as unknown as string,
      target_academic_year_id: year.entity_id,
      target_grade_level_id: gradeId,
      rule_name: "Synthetic Ranking",
      rule_ranking_basis: "AVERAGE",
      rule_tie_method: "DENSE",
      rule_configuration: {},
    });
    expect(ranking.error).toBeNull();
    expect(
      (
        await registrar.rpc("activate_ranking_rule", {
          target_rule_id: ranking.data![0]!.entity_id,
          expected_updated_at: ranking.data![0]!.updated_at,
        })
      ).error,
    ).toBeNull();

    const promotion = await registrar.rpc("save_promotion_rule", {
      target_rule_id: null as unknown as string,
      expected_updated_at: null as unknown as string,
      target_academic_year_id: year.entity_id,
      target_grade_level_id: gradeId,
      rule_name: "Synthetic Promotion",
      rule_minimum_average: 50,
      rule_maximum_aggregate: 30,
      rule_minimum_subjects_passed: 1,
      rule_minimum_attendance_percentage: 80,
      rule_required_subjects: {},
      rule_additional_configuration: {},
    });
    expect(promotion.error).toBeNull();
    expect(
      (
        await registrar.rpc("activate_promotion_rule", {
          target_rule_id: promotion.data![0]!.entity_id,
          expected_updated_at: promotion.data![0]!.updated_at,
        })
      ).error,
    ).toBeNull();

    const stale = await registrar.rpc("activate_academic_year", {
      target_year_id: year.entity_id,
      expected_updated_at: year.updated_at,
    });
    expect(stale.error).not.toBeNull();

    const visible = await registrar
      .from("academic_years")
      .select("id, school_id");
    expect(visible.error).toBeNull();
    expect(visible.data?.every((item) => item.school_id === schoolId)).toBe(
      true,
    );

    const audit = await database.query<{ action: string }>(
      "select action from public.audit_logs where entity_id = $1",
      [year.entity_id],
    );
    expect(audit.rows.map((item) => item.action)).toContain(
      "ACADEMIC_CONFIGURATION_CREATED",
    );
  });

  it("denies forged RPC and direct table mutations to a view-only user", async () => {
    const teacher = await signedIn("head");
    const rpc = await teacher.rpc("create_academic_year", {
      year_name: "Forged",
      year_starts_on: "2031-01-01",
      year_ends_on: "2031-12-31",
    });
    expect(rpc.error).not.toBeNull();
    const direct = await teacher.from("subjects").insert({
      school_id: schoolId,
      code: "FORGED",
      name: "Forged",
      sort_order: 99,
    });
    expect(direct.error).not.toBeNull();
  });
});
