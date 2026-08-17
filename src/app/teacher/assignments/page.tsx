import { BookOpen, CalendarClock, History, School } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyTeacherAssignments } from "@/lib/teacher-assignments/data";

const groups = [
  { status: "CURRENT", title: "Current", icon: School },
  { status: "UPCOMING", title: "Upcoming", icon: CalendarClock },
  { status: "PREVIOUS", title: "Previous", icon: History },
] as const;

export default async function MyAssignmentsPage() {
  const assignments = await getMyTeacherAssignments();
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Selected membership"
        title="My assignments"
        description="Current, upcoming and previous class and subject responsibilities for this school membership only."
        actions={<Badge variant="info">Read only</Badge>}
      />
      {assignments.length ? (
        groups.map((group) => {
          const rows = assignments.filter(
            (item) => item.period_status === group.status,
          );
          const Icon = group.icon;
          return (
            <section
              key={group.status}
              aria-labelledby={`assignment-${group.status.toLowerCase()}`}
            >
              <h2
                id={`assignment-${group.status.toLowerCase()}`}
                className="mb-3 flex items-center gap-2 text-lg font-bold"
              >
                <Icon aria-hidden="true" className="text-primary size-5" />
                {group.title}
              </h2>
              {rows.length ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {rows.map((assignment) => (
                    <Card
                      key={`${assignment.assignment_type}-${assignment.assignment_id}`}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <CardTitle className="text-base">
                            {assignment.grade_name} · {assignment.class_name}
                          </CardTitle>
                          <Badge>{assignment.assignment_type}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm font-semibold">
                          {assignment.subject_name ??
                            (assignment.is_primary
                              ? "Primary class teacher"
                              : "Assistant class teacher")}
                        </p>
                        <p className="text-muted-foreground mt-1 text-sm">
                          {assignment.academic_year_name} ·{" "}
                          {assignment.term_name}
                        </p>
                        <p className="text-muted-foreground mt-3 text-xs">
                          {assignment.starts_on} –{" "}
                          {assignment.ends_on ?? "term end"}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No {group.title.toLowerCase()} assignments.
                </p>
              )}
            </section>
          );
        })
      ) : (
        <EmptyState
          icon={BookOpen}
          title="No assignments recorded"
          description="Your selected membership has no class or subject assignment history. Assignment management is not available in this workspace."
        />
      )}
    </div>
  );
}
