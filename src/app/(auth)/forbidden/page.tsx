import type { Metadata } from "next";
import Link from "next/link";

import { Button, buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signOutAction } from "@/lib/auth/actions";
import { getAuthorizationContext } from "@/lib/authorization/context";
import { hasPermission } from "@/lib/authorization/permissions";

export const metadata: Metadata = {
  title: "Access not permitted",
  robots: { index: false, follow: false },
};

export default async function ForbiddenPage() {
  const context = await getAuthorizationContext();
  const workspace = hasPermission(context, "DASHBOARD_VIEW")
    ? "/dashboard"
    : hasPermission(context, "TEACHER_WORKSPACE_VIEW")
      ? "/teacher"
      : "/";

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Access not permitted</CardTitle>
        <CardDescription>
          Your current school workspace does not permit access to this area.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Link className={buttonStyles()} href={workspace}>
          Back to permitted workspace
        </Link>
        <form action={signOutAction}>
          <Button className="w-full" type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
