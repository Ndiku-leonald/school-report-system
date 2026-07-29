import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const RECOVERY_STATE_PURPOSE = "recovery-state";
export const RECOVERY_PROOF_PURPOSE = "recovery-proof";

type RecoveryStatePayload = {
  version: 1;
  purpose: typeof RECOVERY_STATE_PURPOSE;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  emailHash: string;
};

type RecoveryProofPayload = {
  version: 1;
  purpose: typeof RECOVERY_PROOF_PURPOSE;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  userId: string;
};

export type AuthenticationFlowPayload =
  RecoveryProofPayload | RecoveryStatePayload;

type TokenOptions = {
  now?: number;
  ttlSeconds?: number;
};

function assertStrongSecret(secret: string) {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Authentication flow signing secret is too short.");
  }
}

function sign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

function encodePayload(
  payload:
    | Omit<RecoveryProofPayload, "expiresAt" | "issuedAt" | "nonce" | "version">
    | Omit<
        RecoveryStatePayload,
        "expiresAt" | "issuedAt" | "nonce" | "version"
      >,
  secret: string,
  options: TokenOptions = {},
) {
  assertStrongSecret(secret);
  const issuedAt = options.now ?? Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + (options.ttlSeconds ?? 15 * 60);
  const completePayload: AuthenticationFlowPayload = {
    ...payload,
    version: 1,
    issuedAt,
    expiresAt,
    nonce: randomBytes(18).toString("base64url"),
  } as AuthenticationFlowPayload;
  const encodedPayload = Buffer.from(
    JSON.stringify(completePayload),
    "utf8",
  ).toString("base64url");

  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function normalizeRecoveryEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashRecoveryEmail(email: string, secret: string) {
  assertStrongSecret(secret);
  return createHmac("sha256", secret)
    .update("recovery-email\0")
    .update(normalizeRecoveryEmail(email))
    .digest("base64url");
}

export function recoveryEmailHashMatches(
  email: string,
  expectedHash: string,
  secret: string,
) {
  const actual = Buffer.from(hashRecoveryEmail(email, secret), "base64url");
  const expected = Buffer.from(expectedHash, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createRecoveryState(
  email: string,
  secret: string,
  options?: TokenOptions,
) {
  return encodePayload(
    {
      purpose: RECOVERY_STATE_PURPOSE,
      emailHash: hashRecoveryEmail(email, secret),
    },
    secret,
    options,
  );
}

export function createRecoveryProof(
  userId: string,
  secret: string,
  options?: TokenOptions,
) {
  return encodePayload(
    { purpose: RECOVERY_PROOF_PURPOSE, userId },
    secret,
    options,
  );
}

function isBasePayload(value: unknown): value is AuthenticationFlowPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.version === 1 &&
    typeof payload.purpose === "string" &&
    Number.isInteger(payload.issuedAt) &&
    Number.isInteger(payload.expiresAt) &&
    typeof payload.nonce === "string" &&
    payload.nonce.length >= 16
  );
}

export function verifyAuthenticationFlowToken<
  Purpose extends AuthenticationFlowPayload["purpose"],
>(
  token: string,
  expectedPurpose: Purpose,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): Extract<AuthenticationFlowPayload, { purpose: Purpose }> | null {
  assertStrongSecret(secret);
  const [encodedPayload, providedSignature, extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra) return null;

  const expectedSignature = sign(encodedPayload, secret);
  const provided = Buffer.from(providedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
    if (
      !isBasePayload(payload) ||
      payload.purpose !== expectedPurpose ||
      payload.issuedAt > now ||
      payload.expiresAt <= now
    ) {
      return null;
    }
    if (
      payload.purpose === RECOVERY_STATE_PURPOSE &&
      (typeof payload.emailHash !== "string" || payload.emailHash.length < 32)
    ) {
      return null;
    }
    if (
      payload.purpose === RECOVERY_PROOF_PURPOSE &&
      (typeof payload.userId !== "string" || payload.userId.length === 0)
    ) {
      return null;
    }

    return payload as Extract<AuthenticationFlowPayload, { purpose: Purpose }>;
  } catch {
    return null;
  }
}
