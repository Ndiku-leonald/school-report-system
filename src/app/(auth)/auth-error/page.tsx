import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Authentication link unavailable",
  robots: { index: false, follow: false },
};

export default function AuthErrorPage() {
  return (
    <div className="w-full max-w-md space-y-5">
      <Alert title="This link cannot be used" variant="warning">
        The invitation or recovery link is invalid, expired, or already used.
        Request a new link or contact an administrator.
      </Alert>
      <Link
        href="/staff-login"
        className={buttonStyles({ className: "w-full" })}
      >
        Return to staff sign in
      </Link>
    </div>
  );
}
