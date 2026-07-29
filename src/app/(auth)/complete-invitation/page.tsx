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
import {
  getActiveMemberships,
  getInvitedMemberships,
} from "@/lib/auth/staff-context";
import { requireAuthenticatedStaff } from "@/lib/auth/access";

export const metadata: Metadata = {
  title: "Complete staff invitation",
  robots: { index: false, follow: false },
};

export default async function CompleteInvitationPage() {
  const context = await requireAuthenticatedStaff();
  const invitations = getInvitedMemberships(context);

  if (invitations.length === 0) {
    redirect(
      getActiveMemberships(context).length > 0
        ? "/dashboard"
        : "/account-unavailable",
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Secure your staff account</CardTitle>
        <CardDescription>
          Choose a password to accept the invitation for{" "}
          {invitations.map(({ school }) => school.name).join(", ")}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PasswordForm mode="invitation" />
      </CardContent>
    </Card>
  );
}
