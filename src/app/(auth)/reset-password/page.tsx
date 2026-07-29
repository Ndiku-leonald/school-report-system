import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PasswordForm } from "@/components/auth/password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getVerifiedRecoverySession } from "@/lib/auth/recovery";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  const recoverySession = await getVerifiedRecoverySession();

  if (!recoverySession) {
    redirect("/auth/recovery-invalid");
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>
          After the password changes, you will sign in again on a fresh session.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PasswordForm mode="recovery" />
      </CardContent>
    </Card>
  );
}
