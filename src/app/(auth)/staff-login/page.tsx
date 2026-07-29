import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { sanitizeNextPath } from "@/lib/auth/safe-redirect";

export const metadata: Metadata = {
  title: "Staff sign in",
  robots: { index: false, follow: false },
};

export function StaffLoginContent({
  message,
  next,
}: {
  message?: string;
  next?: string;
}) {
  return (
    <div className="w-full max-w-md">
      <Card>
        <CardHeader>
          <p className="text-primary text-xs font-bold tracking-[0.15em] uppercase">
            Staff access
          </p>
          <CardTitle className="text-2xl">Sign in to your workspace</CardTitle>
          <CardDescription>
            Use the staff credentials assigned through the approved invitation
            process.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} />
          <div className="mt-5 text-center">
            <Link
              href="/forgot-password"
              className="text-primary hover:text-primary-strong text-sm font-semibold"
            >
              Forgot your password?
            </Link>
          </div>
          {message === "password-updated" ? (
            <Alert className="mt-5" title="Password updated" variant="success">
              Sign in with your new password.
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; next?: string }>;
}) {
  const parameters = await searchParams;

  return (
    <StaffLoginContent
      message={parameters.message}
      next={
        parameters.next
          ? sanitizeNextPath(parameters.next, "/dashboard")
          : undefined
      }
    />
  );
}
