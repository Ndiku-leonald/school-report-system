import type { Metadata } from "next";

import { signOutAction } from "@/lib/auth/actions";
import { requireAuthenticatedStaff } from "@/lib/auth/access";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Staff account unavailable",
  robots: { index: false, follow: false },
};

export default async function AccountUnavailablePage() {
  await requireAuthenticatedStaff();

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Staff access is unavailable</CardTitle>
        <CardDescription>
          This account has no active school membership. It may be suspended,
          disabled, or not yet provisioned. Contact an administrator without
          sharing your password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signOutAction}>
          <Button className="w-full" type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
