const INVITATION_CALLBACK_PATH = "/auth/callback";

function isApprovedLocalhost(url: URL) {
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]"
  );
}

function assertSafeApplicationOrigin(applicationUrl: URL) {
  if (applicationUrl.username || applicationUrl.password) {
    throw new Error("The application URL cannot contain credentials.");
  }
  if (
    applicationUrl.protocol !== "https:" &&
    !(
      applicationUrl.protocol === "http:" && isApprovedLocalhost(applicationUrl)
    )
  ) {
    throw new Error("The application URL must use HTTPS outside localhost.");
  }
}

export function getInvitationRedirectUrl(
  trustedApplicationUrl: string,
  invitationState: string,
  suppliedRedirectUrl?: string,
) {
  const applicationUrl = new URL(trustedApplicationUrl);
  assertSafeApplicationOrigin(applicationUrl);
  if (!invitationState) {
    throw new Error("A signed invitation state is required.");
  }

  if (suppliedRedirectUrl) {
    if (suppliedRedirectUrl.startsWith("//")) {
      throw new Error(
        "Protocol-relative invitation redirects are not allowed.",
      );
    }

    const supplied = new URL(suppliedRedirectUrl);
    assertSafeApplicationOrigin(supplied);
    if (
      supplied.origin !== applicationUrl.origin ||
      supplied.username ||
      supplied.password ||
      supplied.hash ||
      supplied.pathname !== INVITATION_CALLBACK_PATH ||
      supplied.search
    ) {
      throw new Error(
        "Invitation redirects must use the fixed same-origin callback without query parameters.",
      );
    }
  }

  const callback = new URL(INVITATION_CALLBACK_PATH, applicationUrl.origin);
  callback.searchParams.set("invitation_state", invitationState);
  return callback.toString();
}
