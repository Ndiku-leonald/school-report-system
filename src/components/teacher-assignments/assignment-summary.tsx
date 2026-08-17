import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ClassTeacherAssignmentRow,
  TeachingAssignmentRow,
} from "@/lib/teacher-assignments/types";

function dateLabel(value: string | null) {
  if (!value) return "Term end";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function AssignmentSummary({
  assignment,
}: {
  assignment: TeachingAssignmentRow | ClassTeacherAssignmentRow;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{assignment.teacher_name}</CardTitle>
          <p className="text-muted-foreground mt-1 font-mono text-xs">
            {assignment.employee_number}
          </p>
        </div>
        <Badge
          variant={
            assignment.period_status === "CURRENT"
              ? "success"
              : assignment.period_status === "UPCOMING"
                ? "info"
                : "neutral"
          }
        >
          {assignment.period_status}
        </Badge>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-muted-foreground text-xs font-semibold uppercase">
              Academic period
            </dt>
            <dd className="mt-1 text-sm">
              {assignment.academic_year_name} · {assignment.term_name}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-semibold uppercase">
              Class
            </dt>
            <dd className="mt-1 text-sm">
              {assignment.grade_name} · {assignment.class_name}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-semibold uppercase">
              Responsibility
            </dt>
            <dd className="mt-1 text-sm">
              {"subject_name" in assignment
                ? assignment.subject_name
                : assignment.is_primary
                  ? "Primary class teacher"
                  : "Assistant class teacher"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-semibold uppercase">
              Starts
            </dt>
            <dd className="mt-1 text-sm">{dateLabel(assignment.starts_on)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-semibold uppercase">
              Ends
            </dt>
            <dd className="mt-1 text-sm">{dateLabel(assignment.ends_on)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-semibold uppercase">
              Teacher role
            </dt>
            <dd className="mt-1 text-sm">
              {assignment.teacher_role.replaceAll("_", " ")}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
