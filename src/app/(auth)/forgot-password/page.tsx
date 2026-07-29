import type { Metadata } from "next";
import Link from "next/link";

import { PasswordResetRequestForm } from "@/components/auth/email-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Reset staff password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter your staff email. The response is intentionally the same whether
          or not an eligible account exists.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PasswordResetRequestForm />
        <Link
          href="/staff-login"
          className="text-primary mt-5 block text-center text-sm font-semibold"
        >
          Return to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
