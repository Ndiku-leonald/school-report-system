import { z } from "zod";

import { recordSystemAuditEvent } from "./lib/system-audit";
import { getInvitationRedirectUrl } from "../src/lib/auth/invitation-redirect";
import { createStaffInvitationState } from "../src/lib/auth/invitation-state";
import { createAdministrativeSupabaseClient } from "../src/lib/supabase/admin";
import { getAdministrativeEnvironment } from "../src/lib/env/administrative";
import type { Database } from "../src/types/database.generated";

type StaffRole = Database["public"]["Enums"]["staff_role"];

const allowedRoles = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "HEAD_TEACHER",
  "ACADEMIC_REGISTRAR",
  "CLASS_TEACHER",
  "SUBJECT_TEACHER",
] as const satisfies readonly StaffRole[];

const inputSchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1).max(100),
  middleName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100),
  employeeNumber: z.string().trim().min(1).max(50),
  schoolId: z.string().uuid(),
  roles: z.array(z.enum(allowedRoles)).min(1),
  redirectUrl: z.string().min(1).optional(),
  allowRemote: z.boolean(),
});

function readArgument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isLocalSupabaseUrl(value: string) {
  const { hostname } = new URL(value);
  return hostname === "127.0.0.1" || hostname === "localhost";
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "Usage: npm run auth:invite-staff -- --email <email> --first-name <name> [--middle-name <name>] --last-name <name> --employee-number <number> --school-id <uuid> --roles <ROLE[,ROLE]> [--redirect-url <url>] [--allow-remote]",
    );
    return;
  }

  const parsedInput = inputSchema.safeParse({
    email: readArgument("email"),
    firstName: readArgument("first-name"),
    middleName: readArgument("middle-name"),
    lastName: readArgument("last-name"),
    employeeNumber: readArgument("employee-number"),
    schoolId: readArgument("school-id"),
    roles: (readArgument("roles") ?? "").split(",").filter(Boolean),
    redirectUrl: readArgument("redirect-url"),
    allowRemote: process.argv.includes("--allow-remote"),
  });
  if (!parsedInput.success) {
    throw new Error(
      `Provisioning input is invalid. Check: ${[
        ...new Set(
          parsedInput.error.issues.map((issue) => String(issue.path[0])),
        ),
      ].join(", ")}.`,
    );
  }
  const input = parsedInput.data;
  const environment = getAdministrativeEnvironment();

  if (
    !isLocalSupabaseUrl(environment.NEXT_PUBLIC_SUPABASE_URL) &&
    !input.allowRemote
  ) {
    throw new Error(
      "Remote provisioning is blocked. Confirm the intended project and rerun with --allow-remote.",
    );
  }

  const admin = createAdministrativeSupabaseClient();
  const { data: school, error: schoolError } = await admin
    .from("schools")
    .select("id")
    .eq("id", input.schoolId)
    .eq("is_active", true)
    .maybeSingle();

  if (schoolError || !school) {
    throw new Error("The selected active school was not found.");
  }

  const { data: duplicateMembership, error: duplicateError } = await admin
    .from("school_staff_memberships")
    .select("id")
    .eq("school_id", input.schoolId)
    .eq("employee_number", input.employeeNumber)
    .maybeSingle();
  if (duplicateError) {
    throw new Error("Existing staff membership checks could not be completed.");
  }
  if (duplicateMembership) {
    throw new Error(
      "That employee number already belongs to a school membership.",
    );
  }

  const invitationState = createStaffInvitationState(input.email);
  const redirectTo = getInvitationRedirectUrl(
    environment.NEXT_PUBLIC_APP_URL,
    invitationState,
    input.redirectUrl,
  );
  const { data: invite, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(input.email, {
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
        ...(input.middleName ? { middle_name: input.middleName } : {}),
      },
      redirectTo,
    });

  if (inviteError || !invite.user) {
    throw new Error("The staff invitation could not be created.");
  }

  let shouldDeleteAuthUser = true;
  let membershipId: string | null = null;

  try {
    const { error: profileError } = await admin.from("profiles").insert({
      id: invite.user.id,
      first_name: input.firstName,
      last_name: input.lastName,
      middle_name: input.middleName,
    });
    if (profileError) throw profileError;

    const { data: membership, error: membershipError } = await admin
      .from("school_staff_memberships")
      .insert({
        school_id: input.schoolId,
        profile_id: invite.user.id,
        employee_number: input.employeeNumber,
        status: "INVITED",
      })
      .select("id")
      .single();
    if (membershipError) throw membershipError;
    membershipId = membership.id;

    const { error: rolesError } = await admin
      .from("staff_role_assignments")
      .insert(
        input.roles.map((role) => ({
          membership_id: membership.id,
          role,
        })),
      );
    if (rolesError) throw rolesError;

    await recordSystemAuditEvent(admin, {
      action: "STAFF_INVITED",
      schoolId: input.schoolId,
      entityId: membership.id,
      newValues: {
        role_count: input.roles.length,
        status: "INVITED",
      },
    });
    shouldDeleteAuthUser = false;
  } finally {
    if (shouldDeleteAuthUser) {
      if (membershipId) {
        await admin
          .from("staff_role_assignments")
          .delete()
          .eq("membership_id", membershipId);
        await admin
          .from("school_staff_memberships")
          .delete()
          .eq("id", membershipId);
      }
      await admin.from("profiles").delete().eq("id", invite.user.id);
      await admin.auth.admin.deleteUser(invite.user.id);
    }
  }

  console.log("Staff invitation provisioned successfully.");
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Staff invitation provisioning failed.",
  );
  process.exitCode = 1;
});
