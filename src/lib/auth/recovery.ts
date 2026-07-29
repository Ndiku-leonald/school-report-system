import "server-only";

import { cookies } from "next/headers";

import {
  RECOVERY_PROOF_COOKIE,
  RECOVERY_PROOF_COOKIE_OPTIONS,
  RECOVERY_PROOF_TTL_SECONDS,
} from "@/lib/auth/constants";
import {
  createRecoveryProof,
  createRecoveryState,
  RECOVERY_PROOF_PURPOSE,
  RECOVERY_STATE_PURPOSE,
  recoveryEmailHashMatches,
  verifyAuthenticationFlowToken,
} from "@/lib/auth/flow-token";
import { getAuthenticationFlowEnvironment } from "@/lib/env/authentication-flow";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CookieWriter = {
  set(
    name: string,
    value: string,
    options: typeof RECOVERY_PROOF_COOKIE_OPTIONS,
  ): unknown;
};

function getSecret() {
  return getAuthenticationFlowEnvironment().AUTH_FLOW_SIGNING_SECRET;
}

export function createPasswordRecoveryState(email: string) {
  return createRecoveryState(email, getSecret(), {
    ttlSeconds: RECOVERY_PROOF_TTL_SECONDS,
  });
}

export function verifyPasswordRecoveryState(token: string) {
  return verifyAuthenticationFlowToken(
    token,
    RECOVERY_STATE_PURPOSE,
    getSecret(),
  );
}

export function recoveryStateMatchesUserEmail(
  email: string,
  expectedHash: string,
) {
  return recoveryEmailHashMatches(email, expectedHash, getSecret());
}

export function setRecoveryProofCookie(cookies: CookieWriter, userId: string) {
  cookies.set(
    RECOVERY_PROOF_COOKIE,
    createRecoveryProof(userId, getSecret(), {
      ttlSeconds: RECOVERY_PROOF_TTL_SECONDS,
    }),
    RECOVERY_PROOF_COOKIE_OPTIONS,
  );
}

export function clearRecoveryProofCookie(cookies: CookieWriter) {
  cookies.set(RECOVERY_PROOF_COOKIE, "", {
    ...RECOVERY_PROOF_COOKIE_OPTIONS,
    maxAge: 0,
  });
}

export function verifyRecoveryProof(token: string, userId: string) {
  const payload = verifyAuthenticationFlowToken(
    token,
    RECOVERY_PROOF_PURPOSE,
    getSecret(),
  );
  return payload?.userId === userId ? payload : null;
}

export async function getVerifiedRecoverySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(RECOVERY_PROOF_COOKIE)?.value;
  if (!token) return null;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || !verifyRecoveryProof(token, user.id)) return null;

  return { supabase, user };
}
