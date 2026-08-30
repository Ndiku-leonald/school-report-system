import Link from "next/link";

import type {
  GeneratedReport,
  ReportHistoryItem,
  ReportSubjectSnapshot,
} from "@/lib/report-snapshots/types";

import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

function value(value: string | number | null | undefined) {
  return value === null || value === undefined || value === ""
    ? "Unavailable"
    : value;
}

export function ReportPreview({
  report,
  subjects,
  history,
}: {
  report: GeneratedReport;
  subjects: ReportSubjectSnapshot[];
  history: ReportHistoryItem[];
}) {
  const snapshot = report.snapshot_data;
  const summary = snapshot.academic_summary;
  const attendance = snapshot.attendance;
  const comments = snapshot.comments;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-5 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <p className="text-muted-foreground text-xs uppercase">School</p>
            <p className="text-lg font-bold">{snapshot.school.name}</p>
            <p className="text-muted-foreground text-sm">
              {snapshot.school.school_code}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase">Student</p>
            <p className="font-semibold">{snapshot.student.display_name}</p>
            <p className="text-muted-foreground font-mono text-xs">
              {snapshot.student.admission_number}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase">Placement</p>
            <p className="font-semibold">
              {snapshot.placement.grade_name} · {snapshot.placement.class_name}
            </p>
            <p className="text-muted-foreground text-xs">
              {snapshot.placement.class_code}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase">
              Academic period
            </p>
            <p className="font-semibold">
              {snapshot.academic_period.academic_year_name}
            </p>
            <p className="text-muted-foreground text-sm">
              {snapshot.academic_period.term_name}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase">
              Report version
            </p>
            <p className="font-mono text-xl font-bold">
              v{report.report_version}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase">
              Source calculation
            </p>
            <p className="font-mono text-xl font-bold">
              v{report.calculation_version}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-muted-foreground text-xs uppercase">
              Report verification
            </p>
            <p className="font-mono text-xs break-all">
              {report.snapshot_checksum.slice(0, 16)}…
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Academic summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Total", summary.overall_total],
            ["Average", summary.overall_average],
            ["Overall grade", summary.overall_grade],
            ["Aggregate", summary.aggregate_total],
            ["Classification", summary.aggregate_classification],
            ["Class position", summary.class_position],
            ["Grade position", summary.grade_level_position],
            ["Completeness", summary.is_complete ? "Complete" : "Incomplete"],
          ].map(([label, item]) => (
            <div key={label}>
              <p className="text-muted-foreground">{label}</p>
              <p className="font-mono font-semibold">
                {value(item as string | number | null)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subject results</CardTitle>
          <p className="text-muted-foreground text-sm">
            Frozen values from the selected calculation run.
          </p>
        </CardHeader>
        <CardContent>
          <div className="border-border overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-surface-muted text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Grade</th>
                  <th className="px-4 py-3">Aggregate</th>
                  <th className="px-4 py-3">Position</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {subjects.map((subject) => (
                  <tr key={subject.subject_id}>
                    <td className="px-4 py-3 font-semibold">
                      {value(subject.subject_name)}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {value(subject.subject_score)}
                    </td>
                    <td className="px-4 py-3">{value(subject.grade)}</td>
                    <td className="px-4 py-3 font-mono">
                      {value(subject.aggregate_points)}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {value(subject.subject_position)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          subject.subject_status === "COMPLETE"
                            ? "success"
                            : "warning"
                        }
                      >
                        {value(subject.subject_status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            {attendance ? (
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Days open</dt>
                  <dd className="font-mono font-semibold">
                    {attendance.days_open}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Present</dt>
                  <dd className="font-mono font-semibold">
                    {attendance.days_present}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Absent</dt>
                  <dd className="font-mono font-semibold">
                    {attendance.days_absent}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Times late</dt>
                  <dd className="font-mono font-semibold">
                    {attendance.times_late}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm">
                Attendance unavailable for this snapshot.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Comments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {comments ? (
              <>
                <div>
                  <p className="text-muted-foreground">Class teacher</p>
                  <p>{value(comments.class_teacher_comment)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Head teacher</p>
                  <p>{value(comments.head_teacher_comment)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Conduct</p>
                  <p>{value(comments.conduct_grade)}</p>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">
                Comments unavailable for this snapshot.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report history</CardTitle>
          <p className="text-muted-foreground text-sm">
            Previous immutable versions remain available to authorized staff.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.map((item) => (
            <Link
              key={item.report_id}
              href={`/dashboard/reports/${item.report_id}`}
              className="border-border hover:border-primary flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-semibold">
                Report v{item.report_version} · calculation v
                {item.calculation_version}
              </span>
              <span className="text-muted-foreground flex items-center gap-3">
                <span className="font-mono text-xs">
                  {item.snapshot_checksum.slice(0, 12)}…
                </span>
                <Badge variant={item.is_latest ? "success" : "neutral"}>
                  {item.is_latest ? "Current" : "Historical"}
                </Badge>
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-xs">
        PDF is available to authorized staff. Publication and parent access are
        unavailable.
      </p>
    </div>
  );
}
