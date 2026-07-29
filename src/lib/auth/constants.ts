export const ACTIVE_SCHOOL_COOKIE = "staff-active-membership";
export const RECOVERY_PROOF_COOKIE = "staff-recovery-proof";
export const RECOVERY_PROOF_TTL_SECONDS = 15 * 60;

export const protectedStaffPaths = [
  "/dashboard",
  "/teacher",
  "/select-school",
  "/complete-invitation",
] as const;

export const authenticatedEntryPaths = [
  "/staff-login",
  "/forgot-password",
] as const;

export const ACTIVE_SCHOOL_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 8,
};

export const RECOVERY_PROOF_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/reset-password",
  maxAge: RECOVERY_PROOF_TTL_SECONDS,
};
