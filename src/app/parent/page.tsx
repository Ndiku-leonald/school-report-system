import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getParentReports, getParentSession } from "@/lib/parent-portal/server";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Parent report access",
  robots: { index: false, follow: false },
};

export default async function ParentPortalPage() {
  const session = await getParentSession();
  if (!session) redirect("/parent/login");
  const reports = await getParentReports();
  if (!reports) redirect("/parent/login");
  return (
    <div className="space-y-6 md:col-span-2">
      <Card>
        <CardHeader>
          <CardTitle>Published report cards</CardTitle>
          <CardDescription>
            Reports available for the verified student are listed below.
            Previous published versions remain available when the school
            supersedes one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reports.length ? (
            <div className="grid gap-3">
              {reports.map((report) => (
                <Link
                  key={report.report_id}
                  href={`/parent/reports/${report.report_id}`}
                  className="border-border hover:bg-surface-muted focus-visible:ring-focus/30 grid gap-2 rounded-lg border p-4 outline-none focus-visible:ring-3 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <span>
                    <span className="block font-semibold">
                      {report.academic_year_label} · {report.term_label}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-sm">
                      {report.grade_label} · {report.class_label} · Version{" "}
                      {report.report_version}
                    </span>
                  </span>
                  <Badge variant={report.is_current ? "success" : "neutral"}>
                    {report.is_current
                      ? "Current"
                      : "Previous published version"}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No published report artifact is currently available.
            </p>
          )}
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-center text-xs">
        Report access is private, temporary and rechecked on every request.
      </p>
    </div>
  );
}
