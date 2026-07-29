import type { Metadata } from "next";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = {
  title: "Parent report access",
  robots: { index: false, follow: false },
};

export default function ParentPortalPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify student access</CardTitle>
        <CardDescription>
          Enter the code and secure PIN issued through the school&apos;s
          approved process.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" aria-describedby="parent-privacy-guidance">
          <div className="grid gap-2">
            <Label htmlFor="student-code">Student code</Label>
            <Input
              id="student-code"
              name="studentCode"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="Enter student code"
            />
            <p className="text-muted-foreground text-xs leading-5">
              Use the exact code supplied by the school.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="secure-pin">Secure PIN</Label>
            <Input
              id="secure-pin"
              name="securePin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Enter secure PIN"
            />
            <p className="text-muted-foreground text-xs leading-5">
              Keep this PIN private and do not share it in messages.
            </p>
          </div>
          <Button className="w-full" type="button">
            Continue
          </Button>
        </form>
        <Alert
          id="parent-privacy-guidance"
          className="mt-5"
          title="Protect student information"
        >
          Use a private device where possible and close the browser after
          viewing a report. Verification will be rate-limited when implemented.
        </Alert>
      </CardContent>
    </Card>
  );
}
