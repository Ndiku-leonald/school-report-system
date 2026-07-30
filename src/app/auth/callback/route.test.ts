import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearSessionActiveMembership: vi.fn(),
  clearRecoveryProofCookie: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  invitationMatchesEmail: vi.fn(),
  membershipResult: vi.fn(),
  recoveryMatchesEmail: vi.fn(),
  setRecoveryProofCookie: vi.fn(),
  signOut: vi.fn(),
  verifyInvitationState: vi.fn(),
  verifyRecoveryState: vi.fn(),
}));

vi.mock("@/lib/env/public", () => ({
  getPublicEnvironment: () => ({
    NEXT_PUBLIC_APP_URL: "https://application.example.invalid",
  }),
}));
vi.mock("@/lib/auth/invitation-state", () => ({
  invitationStateMatchesUserEmail: mocks.invitationMatchesEmail,
  verifyStaffInvitationState: mocks.verifyInvitationState,
}));
vi.mock("@/lib/auth/recovery", () => ({
  clearRecoveryProofCookie: mocks.clearRecoveryProofCookie,
  recoveryStateMatchesUserEmail: mocks.recoveryMatchesEmail,
  setRecoveryProofCookie: mocks.setRecoveryProofCookie,
  verifyPasswordRecoveryState: mocks.verifyRecoveryState,
}));
vi.mock("@/lib/auth/session-membership", () => ({
  clearSessionActiveMembership: mocks.clearSessionActiveMembership,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      getUser: mocks.getUser,
      signOut: mocks.signOut,
    },
    from: mocks.from,
  }),
}));

import { GET } from "@/app/auth/callback/route";

function request(query: string) {
  return new NextRequest(
    `https://application.example.invalid/auth/callback?${query}`,
  );
}

function mockExchangedUser(email = "staff@example.invalid") {
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: "synthetic-user-id",
        email,
      },
    },
    error: null,
  });
}

describe("PKCE authentication callback", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.membershipResult.mockReturnValue({
      data: [{ id: "synthetic-membership-id" }],
      error: null,
    });
    mocks.from.mockImplementation(() => {
      const query = {
        eq: vi.fn(() => query),
        limit: vi.fn(async () => mocks.membershipResult()),
        select: vi.fn(() => query),
      };
      return query;
    });
  });

  it("rejects a code without signed state before consuming it", async () => {
    const response = await GET(request("code=synthetic-code"));

    expect(response.headers.get("location")).toContain("/auth-error");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("closes the former code plus next invitation bypass", async () => {
    const response = await GET(
      request("code=synthetic-code&next=/complete-invitation"),
    );

    expect(response.headers.get("location")).toContain("/auth-error");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("rejects next even when a signed invitation state is present", async () => {
    mocks.verifyInvitationState.mockReturnValue({
      emailHash: "synthetic-email-hash",
    });

    const response = await GET(
      request(
        "code=synthetic-code&invitation_state=valid&next=/complete-invitation",
      ),
    );

    expect(response.headers.get("location")).toContain("/auth-error");
    expect(mocks.verifyInvitationState).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("rejects requests containing both flow states before exchange", async () => {
    mocks.verifyRecoveryState.mockReturnValue({
      emailHash: "recovery-email-hash",
    });
    mocks.verifyInvitationState.mockReturnValue({
      emailHash: "invitation-email-hash",
    });

    const response = await GET(
      request(
        "code=synthetic-code&recovery_state=recovery&invitation_state=invitation",
      ),
    );

    expect(response.headers.get("location")).toContain("/auth-error");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it.each(["modified", "expired"])(
    "rejects a %s invitation state before consuming the code",
    async () => {
      mocks.verifyInvitationState.mockReturnValue(null);

      const response = await GET(
        request("code=synthetic-code&invitation_state=invalid"),
      );

      expect(response.headers.get("location")).toContain("/auth-error");
      expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    },
  );

  it("binds a valid recovery state to the authoritative user email", async () => {
    mocks.verifyRecoveryState.mockReturnValue({
      emailHash: "synthetic-email-hash",
    });
    mockExchangedUser();
    mocks.recoveryMatchesEmail.mockReturnValue(true);

    const response = await GET(
      request("code=synthetic-code&recovery_state=valid"),
    );

    expect(mocks.recoveryMatchesEmail).toHaveBeenCalledWith(
      "staff@example.invalid",
      "synthetic-email-hash",
    );
    expect(mocks.setRecoveryProofCookie).toHaveBeenCalledWith(
      response.cookies,
      "synthetic-user-id",
    );
    expect(response.headers.get("location")).toContain("/reset-password");
  });

  it("rejects recovery when the authoritative user does not match state", async () => {
    mocks.verifyRecoveryState.mockReturnValue({
      emailHash: "synthetic-email-hash",
    });
    mockExchangedUser("other@example.invalid");
    mocks.recoveryMatchesEmail.mockReturnValue(false);

    const response = await GET(
      request("code=synthetic-code&recovery_state=valid"),
    );

    expect(response.headers.get("location")).toContain("/auth-error");
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.clearRecoveryProofCookie).toHaveBeenCalled();
  });

  it("accepts an email-bound invitation with an own invited membership", async () => {
    mocks.verifyInvitationState.mockReturnValue({
      emailHash: "synthetic-email-hash",
    });
    mockExchangedUser();
    mocks.invitationMatchesEmail.mockReturnValue(true);

    const response = await GET(
      request("code=synthetic-code&invitation_state=valid"),
    );

    expect(mocks.invitationMatchesEmail).toHaveBeenCalledWith(
      "staff@example.invalid",
      "synthetic-email-hash",
    );
    expect(mocks.from).toHaveBeenCalledWith("school_staff_memberships");
    expect(response.headers.get("location")).toBe(
      "https://application.example.invalid/complete-invitation",
    );
    expect(mocks.setRecoveryProofCookie).not.toHaveBeenCalled();
  });

  it("rejects an invitation when the authoritative email does not match", async () => {
    mocks.verifyInvitationState.mockReturnValue({
      emailHash: "synthetic-email-hash",
    });
    mockExchangedUser("other@example.invalid");
    mocks.invitationMatchesEmail.mockReturnValue(false);

    const response = await GET(
      request("code=synthetic-code&invitation_state=valid"),
    );

    expect(response.headers.get("location")).toContain("/auth-error");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalled();
  });

  it("rejects an invitation without an invited membership", async () => {
    mocks.verifyInvitationState.mockReturnValue({
      emailHash: "synthetic-email-hash",
    });
    mockExchangedUser();
    mocks.invitationMatchesEmail.mockReturnValue(true);
    mocks.membershipResult.mockReturnValue({ data: [], error: null });

    const response = await GET(
      request("code=synthetic-code&invitation_state=valid"),
    );

    expect(response.headers.get("location")).toContain("/auth-error");
    expect(mocks.signOut).toHaveBeenCalled();
  });

  it.each(["ACTIVE", "SUSPENDED", "DISABLED"])(
    "rejects an invitation when only a %s membership exists",
    async () => {
      mocks.verifyInvitationState.mockReturnValue({
        emailHash: "synthetic-email-hash",
      });
      mockExchangedUser();
      mocks.invitationMatchesEmail.mockReturnValue(true);
      mocks.membershipResult.mockReturnValue({ data: [], error: null });

      const response = await GET(
        request("code=synthetic-code&invitation_state=valid"),
      );

      expect(response.headers.get("location")).toContain("/auth-error");
      expect(mocks.signOut).toHaveBeenCalled();
    },
  );

  it("returns the generic error when code exchange fails", async () => {
    mocks.verifyInvitationState.mockReturnValue({
      emailHash: "synthetic-email-hash",
    });
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: new Error("synthetic exchange failure"),
    });

    const response = await GET(
      request("code=synthetic-code&invitation_state=valid"),
    );

    expect(response.headers.get("location")).toContain("/auth-error");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
