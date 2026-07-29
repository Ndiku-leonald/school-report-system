import type { Metadata } from "next";
import Link from "next/link";

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
  title: "Staff sign in",
  robots: { index: false, follow: false },
};

export default function StaffLoginPage() {
  return (
    <div className="w-full max-w-md">
      <Card>
        <CardHeader>
          <p className="text-primary text-xs font-bold tracking-[0.15em] uppercase">
            Staff access
          </p>
          <CardTitle className="text-2xl">Sign in to your workspace</CardTitle>
          <CardDescription>
            Enter your assigned staff credentials when authentication is enabled
            in a later stage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" aria-describedby="login-status">
            <div className="grid gap-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                placeholder="staff@example.edu"
              />
              <p className="text-muted-foreground text-xs leading-5">
                Use the email address assigned by your administrator.
              </p>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="#login-status"
                  className="text-primary hover:text-primary-strong focus-visible:ring-focus/25 text-xs font-semibold outline-none focus-visible:ring-3"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </div>
            <Button className="w-full" type="button">
              Sign in
            </Button>
          </form>
          <Alert
            id="login-status"
            className="mt-5"
            title="Authentication is not connected"
          >
            Sign-in and password recovery will be implemented in Stage 4.
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
