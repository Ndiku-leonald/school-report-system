import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type User } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/types/database.generated";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const schoolId = "10000000-0000-4000-8000-000000000001";
const password = "synthetic-local-password-only";

const admin = createClient<Database>(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});

const users: User[] = [];
const membershipIds: string[] = [];
const nonce = Date.now();
const activeEmail = `synthetic.active.${nonce}@example.invalid`;
const suspendedEmail = `synthetic.suspended.${nonce}@example.invalid`;
const invitedEmail = `synthetic.invited.${nonce}@example.invalid`;
const disabledEmail = `synthetic.disabled.${nonce}@example.invalid`;
const noMembershipEmail = `synthetic.no-membership.${nonce}@example.invalid`;
const policyEmail = `synthetic.policy.${nonce}@example.invalid`;
const invitationEmail = `synthetic.admin-invite.${nonce}@example.invalid`;

describe("local staff-only Auth policy", () => {
  it("disables public signup while retaining invited-staff email login", () => {
    const config = readFileSync(
      join(process.cwd(), "supabase", "config.toml"),
      "utf8",
    );

    expect(config).toMatch(/\[auth]\s[\s\S]*?enable_signup = false/);
    expect(config).toMatch(/\[auth\.email]\s[\s\S]*?enable_signup = true/);
    expect(config).toMatch(/enable_anonymous_sign_ins = false/);
  });

  it("rejects public email signup", async () => {
    const client = createClient<Database>(url, anonKey);
    const { data, error } = await client.auth.signUp({
      email: `synthetic.public-signup.${nonce}@example.invalid`,
      password,
    });

    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it("allows trusted administrative invitation while signup is disabled", async () => {
    const { data, error } =
      await admin.auth.admin.inviteUserByEmail(invitationEmail);

    expect(error).toBeNull();
    expect(data.user?.email).toBe(invitationEmail);
    if (data.user) users.push(data.user);
  });

  it("enforces the twelve-character minimum in Supabase Auth", async () => {
    const created = await admin.auth.admin.createUser({
      email: policyEmail,
      password,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    if (!created.data.user)
      throw new Error("Policy test user was not created.");
    users.push(created.data.user);

    const client = createClient<Database>(url, anonKey);
    const signIn = await client.auth.signInWithPassword({
      email: policyEmail,
      password,
    });
    expect(signIn.error).toBeNull();

    const shortResult = await client.auth.updateUser({
      password: "Short1!",
    });
    expect(shortResult.error).not.toBeNull();
    expect(shortResult.error?.code).toBe("weak_password");

    const validResult = await client.auth.updateUser({
      password: "Abcdefghi1!x",
    });
    expect(validResult.error).toBeNull();
    expect(validResult.data.user?.email).toBe(policyEmail);
  });
});

async function provisionUser(
  email: string,
  status: "ACTIVE" | "DISABLED" | "INVITED" | "SUSPENDED" | null,
) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  users.push(data.user);

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    first_name: "Synthetic",
    last_name: status ?? "No Membership",
  });
  if (profileError) throw profileError;

  if (!status) return;

  const { data: membership, error: membershipError } = await admin
    .from("school_staff_memberships")
    .insert({
      school_id: schoolId,
      profile_id: data.user.id,
      employee_number: `AUTH-${status}-${nonce}`,
      status,
    })
    .select("id")
    .single();
  if (membershipError) throw membershipError;
  membershipIds.push(membership.id);

  const { error: roleError } = await admin
    .from("staff_role_assignments")
    .insert({
      membership_id: membership.id,
      role: "SUBJECT_TEACHER",
    });
  if (roleError) throw roleError;
}

describe.sequential("local staff authentication integration", () => {
  beforeAll(async () => {
    await provisionUser(activeEmail, "ACTIVE");
    await provisionUser(suspendedEmail, "SUSPENDED");
    await provisionUser(invitedEmail, "INVITED");
    await provisionUser(disabledEmail, "DISABLED");
    await provisionUser(noMembershipEmail, null);
  });

  afterAll(async () => {
    if (membershipIds.length) {
      await admin
        .from("staff_role_assignments")
        .delete()
        .in("membership_id", membershipIds);
      await admin
        .from("school_staff_memberships")
        .delete()
        .in("id", membershipIds);
    }
    if (users.length) {
      await admin
        .from("profiles")
        .delete()
        .in(
          "id",
          users.map(({ id }) => id),
        );
    }
    await Promise.all(users.map(({ id }) => admin.auth.admin.deleteUser(id)));
  });

  it("rejects invalid credentials without identifying the account", async () => {
    const client = createClient<Database>(url, anonKey);
    const { data, error } = await client.auth.signInWithPassword({
      email: activeEmail,
      password: "incorrect-synthetic-password",
    });

    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it("creates a cookie-compatible session and exposes only own identity rows", async () => {
    const client = createClient<Database>(url, anonKey);
    const { data, error } = await client.auth.signInWithPassword({
      email: activeEmail,
      password,
    });

    expect(error).toBeNull();
    expect(data.session?.refresh_token).toBeTruthy();

    const [profiles, memberships, roles, schools] = await Promise.all([
      client.from("profiles").select("*"),
      client.from("school_staff_memberships").select("*"),
      client.from("staff_role_assignments").select("*"),
      client.from("schools").select("*"),
    ]);

    expect(profiles.data).toHaveLength(1);
    expect(profiles.data?.[0].id).toBe(data.user?.id);
    expect(memberships.data).toHaveLength(1);
    expect(memberships.data?.[0].status).toBe("ACTIVE");
    expect(roles.data).toHaveLength(1);
    expect(schools.data).toHaveLength(1);

    const academic = await client.from("students").select("id");
    expect(academic.error?.code).toBe("42501");

    const write = await client
      .from("profiles")
      .update({ first_name: "Denied" })
      .eq("id", data.user!.id);
    expect(write.error?.code).toBe("42501");
  });

  it("authenticates a suspended identity while exposing its unavailable status", async () => {
    const client = createClient<Database>(url, anonKey);
    const { error } = await client.auth.signInWithPassword({
      email: suspendedEmail,
      password,
    });
    expect(error).toBeNull();

    const membership = await client
      .from("school_staff_memberships")
      .select("status")
      .single();
    expect(membership.data?.status).toBe("SUSPENDED");
  });

  it.each([
    [invitedEmail, "INVITED"],
    [disabledEmail, "DISABLED"],
  ] as const)(
    "exposes the authoritative %s membership state",
    async (email, status) => {
      const client = createClient<Database>(url, anonKey);
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      expect(error).toBeNull();

      const membership = await client
        .from("school_staff_memberships")
        .select("status")
        .single();
      expect(membership.data?.status).toBe(status);
    },
  );

  it("does not invent staff access for a valid Auth user without membership", async () => {
    const client = createClient<Database>(url, anonKey);
    const { error } = await client.auth.signInWithPassword({
      email: noMembershipEmail,
      password,
    });
    expect(error).toBeNull();

    const memberships = await client
      .from("school_staff_memberships")
      .select("id");
    expect(memberships.data).toEqual([]);
  });
});
