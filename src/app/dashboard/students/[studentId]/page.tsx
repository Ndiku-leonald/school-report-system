import {
  CalendarDays,
  Camera,
  History,
  Pencil,
  School,
  Shield,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import {
  GuardianManager,
  LifecycleForm,
  PhotoForm,
} from "@/components/student-management/management-panels";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { getStudentRecord } from "@/lib/student-management/data";

function dateLabel(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const data = await getStudentRecord(studentId);
  const student = data.student;
  const current = data.history.find(
    (item) => item.status === "ACTIVE" || item.status === "REPEATING",
  );
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={`Admission ${student.admission_number}`}
        title={`${student.first_name} ${student.middle_name ?? ""} ${student.last_name}`}
        description="Profile, current placement and preserved learner history for the selected school."
        actions={
          data.canManage ? (
            <div className="flex flex-wrap gap-2">
              <Link
                className={buttonStyles({ variant: "secondary" })}
                href={`/dashboard/students/${studentId}/edit`}
              >
                <Pencil aria-hidden="true" className="size-4" />
                Edit profile
              </Link>
              <Link
                className={buttonStyles()}
                href={`/dashboard/students/${studentId}/enrollment`}
              >
                <School aria-hidden="true" className="size-4" />
                Manage enrolment
              </Link>
            </div>
          ) : undefined
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,.6fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-start gap-5">
              <div className="bg-surface-muted relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl">
                {data.photoUrl ? (
                  <Image
                    src={data.photoUrl}
                    alt={`Private profile photo for ${student.first_name} ${student.last_name}`}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                ) : (
                  <Camera
                    aria-hidden="true"
                    className="text-muted-foreground size-7"
                  />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>Student profile</CardTitle>
                  <Badge
                    variant={
                      student.status === "ACTIVE" ? "success" : "warning"
                    }
                  >
                    {student.status}
                  </Badge>
                </div>
                <CardDescription>
                  Personally identifying details are restricted to authorised
                  school staff.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground text-xs font-semibold uppercase">
                    Admission number
                  </dt>
                  <dd className="mt-1 font-mono text-sm">
                    {student.admission_number}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs font-semibold uppercase">
                    Gender
                  </dt>
                  <dd className="mt-1 text-sm">
                    {student.gender ?? "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs font-semibold uppercase">
                    Date of birth
                  </dt>
                  <dd className="mt-1 text-sm">
                    {dateLabel(student.date_of_birth)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs font-semibold uppercase">
                    Admitted
                  </dt>
                  <dd className="mt-1 text-sm">
                    {dateLabel(student.admission_date)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs font-semibold uppercase">
                    Current class
                  </dt>
                  <dd className="mt-1 text-sm">
                    {current
                      ? `${current.grade_name} · ${current.class_name}`
                      : "Not enrolled"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs font-semibold uppercase">
                    Class number
                  </dt>
                  <dd className="mt-1 text-sm">
                    {current?.class_number ?? "Not assigned"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <History aria-hidden="true" className="text-primary size-5" />
                <CardTitle>Enrolment history</CardTitle>
              </div>
              <CardDescription>
                Historical placements are retained; no student or enrolment
                record is physically deleted.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.history.length ? (
                <ol className="relative grid gap-4 border-l pl-5">
                  {data.history.map((item) => (
                    <li key={item.enrollment_id} className="relative">
                      <span className="bg-primary absolute top-1 -left-[1.55rem] size-2 rounded-full" />
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">
                            {item.academic_year_name} · {item.grade_name} ·{" "}
                            {item.class_name}
                          </p>
                          <p className="text-muted-foreground mt-1 text-sm">
                            Enrolled {dateLabel(item.enrolled_on)}
                            {item.exited_on
                              ? ` · Exited ${dateLabel(item.exited_on)}`
                              : ""}
                            {item.class_number
                              ? ` · No. ${item.class_number}`
                              : ""}
                          </p>
                        </div>
                        <Badge
                          variant={
                            item.status === "ACTIVE"
                              ? "success"
                              : item.status === "REPEATING"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {item.status}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No enrolment has been recorded.
                </p>
              )}
            </CardContent>
          </Card>
          {data.canViewGuardians ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UsersRound
                    aria-hidden="true"
                    className="text-primary size-5"
                  />
                  <CardTitle>Guardians</CardTitle>
                </div>
                <CardDescription>
                  Contact details are available only to schoolwide authorised
                  viewers. Report eligibility does not create parent access.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.canManage ? (
                  <GuardianManager
                    studentId={studentId}
                    guardians={data.guardians}
                  />
                ) : data.guardians.length ? (
                  <div className="grid gap-3">
                    {data.guardians.map((guardian) => (
                      <div
                        className="bg-surface-muted rounded-lg p-4"
                        key={guardian.relationship_id}
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="font-semibold">
                            {guardian.first_name} {guardian.middle_name}{" "}
                            {guardian.last_name}
                          </p>
                          {guardian.is_primary ? (
                            <Badge variant="success">Primary</Badge>
                          ) : null}
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm">
                          {guardian.relationship} ·{" "}
                          {guardian.phone ?? "No phone"} ·{" "}
                          {guardian.email ?? "No email"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No guardian relationship is recorded.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Alert title="Guardian details protected">
              <div className="flex items-start gap-2">
                <Shield aria-hidden="true" className="mt-1 size-4 shrink-0" />
                <p>
                  Assignment-scoped access intentionally excludes guardian IDs,
                  contacts and report-access flags.
                </p>
              </div>
            </Alert>
          )}
        </div>
        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CalendarDays
                  aria-hidden="true"
                  className="text-primary size-5"
                />
                <CardTitle>Current placement</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {current ? (
                <div className="space-y-2">
                  <p className="text-lg font-bold">
                    {current.grade_name} · {current.class_name}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {current.academic_year_name} · {current.status}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No current placement.
                </p>
              )}
            </CardContent>
          </Card>
          {data.canManage ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <UserRoundCog
                      aria-hidden="true"
                      className="text-primary size-5"
                    />
                    <CardTitle>Lifecycle status</CardTitle>
                  </div>
                  <CardDescription>
                    Status changes are explicit, concurrency checked and audited
                    with a reason.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <LifecycleForm student={student} today={today} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Student photograph</CardTitle>
                  <CardDescription>
                    Upload through the private authenticated Storage boundary.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PhotoForm student={student} />
                </CardContent>
              </Card>
            </>
          ) : (
            <Alert title="View-only access">
              Your selected role can review this student but cannot change the
              profile, placement, guardian links or photo.
            </Alert>
          )}
        </aside>
      </div>
    </div>
  );
}
