import { BookOpen, ClipboardCheck, ListChecks, Shapes } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const workspaceAreas = [
  {
    title: "Assigned classes",
    description: "Class assignments will appear after academic setup.",
    icon: Shapes,
  },
  {
    title: "Assigned subjects",
    description: "Subject access will follow explicit teacher assignments.",
    icon: BookOpen,
  },
  {
    title: "Marks awaiting completion",
    description: "Draft marks work will be added in the marks-entry stage.",
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
        description="A focused area for future class assignments, subject responsibilities, marks preparation, and submission tracking."
        actions={<Badge variant="info">No assignments connected</Badge>}
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
        title="Nothing requires attention yet"
        description="Live assignments and mark-status information will appear only after authentication, permissions, academic configuration, and teacher assignments are implemented."
      />
    </div>
  );
}
