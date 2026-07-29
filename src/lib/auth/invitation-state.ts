import "server-only";

import {
  authenticationFlowEmailHashMatches,
  createInvitationState,
  INVITATION_STATE_PURPOSE,
  verifyAuthenticationFlowToken,
} from "@/lib/auth/flow-token";
import { RECOVERY_PROOF_TTL_SECONDS } from "@/lib/auth/constants";
import { getAuthenticationFlowEnvironment } from "@/lib/env/authentication-flow";

function getSecret() {
  return getAuthenticationFlowEnvironment().AUTH_FLOW_SIGNING_SECRET;
}

export function createStaffInvitationState(email: string) {
  return createInvitationState(email, getSecret(), {
    ttlSeconds: RECOVERY_PROOF_TTL_SECONDS,
  });
}

export function verifyStaffInvitationState(token: string) {
  return verifyAuthenticationFlowToken(
    token,
    INVITATION_STATE_PURPOSE,
    getSecret(),
  );
}

export function invitationStateMatchesUserEmail(
  email: string,
  expectedHash: string,
) {
  return authenticationFlowEmailHashMatches(email, expectedHash, getSecret());
}
