import { BookOpen, ClipboardCheck, ListChecks, Shapes } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const workspaceAreas = [
  {
    title: "Assigned classes",
    description:
      "Review current, upcoming and previous class responsibilities.",
    icon: Shapes,
  },
  {
    title: "Assigned subjects",
    description: "Subject access follows effective-dated teacher assignments.",
    icon: BookOpen,
  },
  {
    title: "Marks awaiting completion",
    description:
      "Open current subject assignments and save DRAFT component marks.",
    icon: ListChecks,
  },
  {
    title: "Submitted marks",
    description: "Submission status will appear after workflow implementation.",
    icon: ClipboardCheck,
  },
];

export default function TeacherPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Authenticated workspace"
        title="Teacher workspace"
        description="A focused area for assigned classes, subjects and secure DRAFT marks entry."
        actions={
          <Link className={buttonStyles()} href="/teacher/assignments">
            View my assignments
          </Link>
        }
      />

      <section
        aria-label="Teacher workspace areas"
        className="grid gap-4 sm:grid-cols-2"
      >
        {workspaceAreas.map((area) => {
          const Icon = area.icon;

          return (
            <Card key={area.title}>
              <CardHeader>
                <span className="bg-primary-soft text-primary mb-3 flex size-10 items-center justify-center rounded-lg">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <CardTitle className="text-base">{area.title}</CardTitle>
                <CardDescription>{area.description}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </section>

      <EmptyState
        icon={ClipboardCheck}
        title="Workflow submission is not active"
        description="DRAFT marks entry is available now. Submission, review, approval and locking remain reserved for Stage 10."
      />
    </div>
  );
}
