"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ACTIVE_SCHOOL_COOKIE,
  ACTIVE_SCHOOL_COOKIE_OPTIONS,
} from "@/lib/auth/constants";
import { recordStaffAuditEvent } from "@/lib/auth/audit";
import {
  emailSchema,
  loginSchema,
  passwordSchema,
  selectSchoolSchema,
  type AuthActionState,
} from "@/lib/auth/schemas";
import { sanitizeNextPath } from "@/lib/auth/safe-redirect";
import {
  getActiveMemberships,
  getInvitedMemberships,
  getStaffContext,
} from "@/lib/auth/staff-context";
import { getPublicEnvironment } from "@/lib/env/public";
import { createAdministrativeSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const genericSignInError =
  "Sign-in was unsuccessful. Check your details or contact an administrator.";

function errorState(
  message: string,
  fieldErrors?: AuthActionState["fieldErrors"],
): AuthActionState {
  return { status: "error", message, fieldErrors };
}

export async function signInAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });

  if (!result.success) {
    return errorState(
      "Correct the highlighted fields and try again.",
      result.error.flatten().fieldErrors,
    );
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: result.data.email,
    password: result.data.password,
  });

  if (error) {
    return errorState(genericSignInError);
  }

  const context = await getStaffContext();

  if (!context || !context.profile) {
    await supabase.auth.signOut();
    return errorState(genericSignInError);
  }

  const activeMemberships = getActiveMemberships(context);
  const invitedMemberships = getInvitedMemberships(context);
  const auditMembership =
    context.activeMembership ??
    activeMemberships[0] ??
    invitedMemberships[0] ??
    context.memberships[0];

  if (auditMembership) {
    await recordStaffAuditEvent({
      action: "STAFF_SIGN_IN_SUCCESS",
      entityType: "staff_session",
      membership: auditMembership,
    });
  }

  if (context.activeMembership) {
    const cookieStore = await cookies();
    cookieStore.set(
      ACTIVE_SCHOOL_COOKIE,
      context.activeMembership.id,
      ACTIVE_SCHOOL_COOKIE_OPTIONS,
    );
    revalidatePath("/", "layout");
    redirect(sanitizeNextPath(result.data.next));
  }

  if (activeMemberships.length === 1) {
    const cookieStore = await cookies();
    cookieStore.set(
      ACTIVE_SCHOOL_COOKIE,
      activeMemberships[0].id,
      ACTIVE_SCHOOL_COOKIE_OPTIONS,
    );
    revalidatePath("/", "layout");
    redirect(sanitizeNextPath(result.data.next));
  }

  if (activeMemberships.length > 1) {
    const next = encodeURIComponent(sanitizeNextPath(result.data.next));
    redirect(`/select-school?next=${next}`);
  }

  if (invitedMemberships.length > 0) {
    redirect("/complete-invitation");
  }

  redirect("/account-unavailable");
}

export async function requestPasswordResetAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = emailSchema.safeParse({ email: formData.get("email") });

  if (!result.success) {
    return errorState(
      "Enter a valid email address.",
      result.error.flatten().fieldErrors,
    );
  }

  const environment = getPublicEnvironment();
  const supabase = await createServerSupabaseClient();
  await supabase.auth.resetPasswordForEmail(result.data.email, {
    redirectTo: `${environment.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });

  return {
    status: "success",
    message:
      "If an eligible staff account exists, password-reset instructions have been sent.",
  };
}

export async function resetPasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = passwordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!result.success) {
    return errorState(
      "Correct the highlighted fields and try again.",
      result.error.flatten().fieldErrors,
    );
  }

  const context = await getStaffContext();

  if (!context) {
    return errorState("This recovery session is invalid or has expired.");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({
    password: result.data.password,
  });

  if (error) {
    return errorState("The password could not be updated. Request a new link.");
  }

  const auditMembership =
    context.activeMembership ?? context.memberships[0] ?? null;

  if (auditMembership) {
    await recordStaffAuditEvent({
      action: "PASSWORD_RESET_COMPLETED",
      entityType: "staff_account",
      entityId: context.user.id,
      membership: auditMembership,
    });
  }

  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_SCHOOL_COOKIE);
  revalidatePath("/", "layout");
  redirect("/staff-login?message=password-updated");
}

export async function completeInvitationAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = passwordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!result.success) {
    return errorState(
      "Correct the highlighted fields and try again.",
      result.error.flatten().fieldErrors,
    );
  }

  const context = await getStaffContext();

  if (!context?.profile) {
    return errorState("This invitation is invalid or has expired.");
  }

  const invitedMemberships = getInvitedMemberships(context);

  if (invitedMemberships.length === 0) {
    return errorState("No pending staff invitation is available.");
  }

  const supabase = await createServerSupabaseClient();
  const { error: passwordError } = await supabase.auth.updateUser({
    password: result.data.password,
  });

  if (passwordError) {
    return errorState(
      "The invitation could not be completed. Request a new link.",
    );
  }

  const admin = createAdministrativeSupabaseClient();
  const membershipIds = invitedMemberships.map(({ id }) => id);
  const { error: activationError } = await admin
    .from("school_staff_memberships")
    .update({
      status: "ACTIVE",
      joined_at: new Date().toISOString().slice(0, 10),
    })
    .in("id", membershipIds)
    .eq("profile_id", context.user.id)
    .eq("status", "INVITED");

  if (activationError) {
    await supabase.auth.signOut();
    return errorState(
      "The account was secured, but staff access could not be activated. Contact an administrator.",
    );
  }

  for (const membership of invitedMemberships) {
    await recordStaffAuditEvent({
      action: "STAFF_INVITATION_COMPLETED",
      entityType: "school_staff_membership",
      entityId: membership.id,
      membership: { ...membership, status: "ACTIVE" },
    });
    await recordStaffAuditEvent({
      action: "STAFF_MEMBERSHIP_ACTIVATED",
      entityType: "school_staff_membership",
      entityId: membership.id,
      membership: { ...membership, status: "ACTIVE" },
    });
  }

  const cookieStore = await cookies();
  if (invitedMemberships.length === 1) {
    cookieStore.set(
      ACTIVE_SCHOOL_COOKIE,
      invitedMemberships[0].id,
      ACTIVE_SCHOOL_COOKIE_OPTIONS,
    );
  } else {
    cookieStore.delete(ACTIVE_SCHOOL_COOKIE);
  }
  revalidatePath("/", "layout");
  redirect(invitedMemberships.length === 1 ? "/dashboard" : "/select-school");
}

export async function selectActiveSchoolAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = selectSchoolSchema.safeParse({
    membershipId: formData.get("membershipId"),
    next: formData.get("next") || undefined,
  });

  if (!result.success) {
    return errorState(
      "Select an available school.",
      result.error.flatten().fieldErrors,
    );
  }

  const context = await getStaffContext();
  const membership = context
    ? getActiveMemberships(context).find(
        ({ id }) => id === result.data.membershipId,
      )
    : null;

  if (!context || !membership) {
    return errorState("That school is no longer available for this account.");
  }

  const cookieStore = await cookies();
  cookieStore.set(
    ACTIVE_SCHOOL_COOKIE,
    membership.id,
    ACTIVE_SCHOOL_COOKIE_OPTIONS,
  );
  await recordStaffAuditEvent({
    action: "ACTIVE_SCHOOL_SELECTED",
    entityType: "school_staff_membership",
    entityId: membership.id,
    membership,
  });
  revalidatePath("/", "layout");
  redirect(sanitizeNextPath(result.data.next));
}

export async function signOutAction() {
  const context = await getStaffContext();
  const auditMembership =
    context?.activeMembership ?? context?.memberships[0] ?? null;

  if (auditMembership) {
    await recordStaffAuditEvent({
      action: "STAFF_SIGN_OUT",
      entityType: "staff_session",
      membership: auditMembership,
    });
  }

  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_SCHOOL_COOKIE);
  revalidatePath("/", "layout");
  redirect("/staff-login");
}
