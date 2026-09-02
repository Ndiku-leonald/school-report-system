import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getParentReportDetail,
  getParentSession,
} from "@/lib/parent-portal/server";

export const metadata: Metadata = {
  title: "Published report",
  robots: { index: false, follow: false },
};

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function renderValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) {
    return value.length ? (
      <div className="grid gap-2">
        {value.map((item, index) => (
          <div key={index}>{renderValue(item)}</div>
        ))}
      </div>
    ) : null;
  }
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        const rendered = renderValue(item);
        return rendered ? (
          <div key={key}>
            <dt className="text-muted-foreground text-xs font-semibold uppercase">
              {label(key)}
            </dt>
            <dd className="mt-1 text-sm leading-6">{rendered}</dd>
          </div>
        ) : null;
      })}
    </dl>
  );
}

export default async function ParentReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const session = await getParentSession();
  if (!session) redirect("/parent/login");
  const { reportId } = await params;
  const report = await getParentReportDetail(reportId);
  if (!report) notFound();
  const data = report.parent_data;
  const student = data.student as
    { display_name?: string; admission_number?: string } | undefined;
  const period = data.academic_period as
    { academic_year_name?: string; term_name?: string } | undefined;
  return (
    <div className="space-y-6 md:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-primary text-xs font-bold tracking-[0.16em] uppercase">
            Secure report view
          </p>
          <h1 className="text-foreground mt-2 text-3xl font-bold tracking-tight">
            {student?.display_name ?? "Student report"}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {period?.academic_year_name} · {period?.term_name} · Version{" "}
            {report.report_version}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={report.is_current ? "success" : "neutral"}>
            {report.is_current ? "Current" : "Superseded"}
          </Badge>
          <Link
            className={buttonStyles({ variant: "secondary", size: "sm" })}
            href={`/parent/api/reports/${report.report_id}/artifact`}
          >
            Download PDF
          </Link>
        </div>
      </div>
      <Alert title="Private school record">
        This page contains the published report snapshot selected by the school.
        It is not regenerated from live marks.
      </Alert>
      {Object.entries(data).map(([section, value]) =>
        section === "student" || section === "academic_period" ? null : (
          <Card key={section}>
            <CardHeader>
              <CardTitle>{label(section)}</CardTitle>
            </CardHeader>
            <CardContent>
              {renderValue(value) ?? (
                <p className="text-muted-foreground text-sm">Not recorded.</p>
              )}
            </CardContent>
          </Card>
        ),
      )}
    </div>
  );
}
