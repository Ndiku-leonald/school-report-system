import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SchoolSelector } from "@/components/auth/school-selector";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAuthenticatedStaff } from "@/lib/auth/access";
import { sanitizeNextPath } from "@/lib/auth/safe-redirect";
import { getActiveMemberships } from "@/lib/auth/staff-context";

export const metadata: Metadata = {
  title: "Select school",
  robots: { index: false, follow: false },
};

export default async function SelectSchoolPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const context = await requireAuthenticatedStaff();
  const memberships = getActiveMemberships(context);

  if (memberships.length === 0) {
    redirect("/account-unavailable");
  }

  if (memberships.length === 1) {
    redirect("/dashboard");
  }

  const { next } = await searchParams;

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Select a school workspace</CardTitle>
        <CardDescription>
          Your selection is bound to this authenticated session and revalidated
          on every protected request.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SchoolSelector
          next={next ? sanitizeNextPath(next) : undefined}
          options={memberships.map((membership) => ({
            membershipId: membership.id,
            schoolName: membership.school.name,
            employeeNumber: membership.employee_number,
          }))}
        />
      </CardContent>
    </Card>
  );
}
