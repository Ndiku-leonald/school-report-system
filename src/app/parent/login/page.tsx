import type { Metadata } from "next";

import { ParentLoginForm } from "@/components/parent-portal/parent-login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Parent report access",
  robots: { index: false, follow: false },
};

export default function ParentLoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify student access</CardTitle>
        <CardDescription>
          Enter the one-time access code and secure PIN issued through the
          school&apos;s approved process.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ParentLoginForm />
        <p
          id="parent-privacy-guidance"
          className="text-muted-foreground mt-5 text-sm leading-6"
        >
          Use a private device where possible and close the browser after
          viewing a report. Published reports are available only to eligible,
          active guardians.
        </p>
      </CardContent>
    </Card>
  );
}
