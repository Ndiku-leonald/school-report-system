import {
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  Settings2,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const readinessAreas = [
  {
    title: "Academic configuration",
    description: "Years, terms, classes, streams, subjects, and rules.",
    icon: Settings2,
  },
  {
    title: "Student records",
    description: "Enrolment and learner records will be introduced later.",
    icon: GraduationCap,
  },
  {
    title: "Subject setup",
    description: "Subject catalogues remain database-configurable.",
    icon: BookOpen,
  },
  {
    title: "Approval workflow",
    description: "Submission, review, approval, and locking are not active.",
    icon: ClipboardCheck,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Stage 2 workspace"
        title="Administration overview"
        description="The dashboard shell is ready for secure academic modules. Live academic data and operational totals will appear only after the relevant stages are implemented."
        actions={<Badge variant="success">Interface ready</Badge>}
      />

      <Alert title="No live academic data is connected">
        These summaries describe implementation readiness and do not represent
        students, staff, classes, marks, or reports.
      </Alert>

      <section aria-labelledby="readiness-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2
              id="readiness-heading"
              className="text-foreground text-lg font-bold tracking-tight"
            >
              Foundation readiness
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Planned modules remain intentionally unavailable.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {readinessAreas.map((area) => {
            const Icon = area.icon;

            return (
              <Card key={area.title}>
                <CardHeader className="flex-row items-start gap-4 space-y-0">
                  <span className="bg-primary-soft text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <CardTitle className="text-base">{area.title}</CardTitle>
                    <p className="text-muted-foreground mt-1 text-sm leading-6">
                      {area.description}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Badge>Planned stage</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
