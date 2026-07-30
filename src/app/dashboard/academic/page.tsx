import {
  BookOpen,
  CalendarRange,
  ChartNoAxesColumnIncreasing,
  GraduationCap,
  ListChecks,
  Scale,
  School,
  Shapes,
} from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicConfigurationData } from "@/lib/academic-configuration/data";

const cards = [
  ["Years and terms", "/dashboard/academic/years", CalendarRange, "years"],
  ["Grade levels", "/dashboard/academic/grade-levels", GraduationCap, "grades"],
  ["Class sections", "/dashboard/academic/classes", School, "classes"],
  ["Subjects", "/dashboard/academic/subjects", BookOpen, "subjects"],
  ["Curriculum", "/dashboard/academic/curriculum", Shapes, "curriculum"],
  [
    "Assessment schemes",
    "/dashboard/academic/assessment-schemes",
    ListChecks,
    "schemes",
  ],
  ["Grading scales", "/dashboard/academic/grading", Scale, "grading"],
  [
    "Rules",
    "/dashboard/academic/ranking",
    ChartNoAxesColumnIncreasing,
    "ranking",
  ],
] as const;

export default async function AcademicConfigurationPage() {
  const data = await getAcademicConfigurationData();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="School-scoped setup"
        title="Academic configuration"
        description="Manage the structures and versioned rules that later academic workflows will use. Changes are permission checked, concurrency protected, and audited."
        actions={
          <Badge variant={data.canManage ? "success" : undefined}>
            {data.canManage ? "Management access" : "View access"}
          </Badge>
        }
      />
      <section aria-labelledby="configuration-sections">
        <h2 id="configuration-sections" className="sr-only">
          Configuration sections
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([title, href, Icon, key]) => (
            <Link
              key={href}
              href={href}
              className="group focus-visible:ring-focus/30 rounded-xl outline-none focus-visible:ring-3"
            >
              <Card className="h-full transition-transform group-hover:-translate-y-0.5">
                <CardHeader>
                  <span className="bg-primary-soft text-primary mb-2 flex size-10 items-center justify-center rounded-lg">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    {data[key].length} configured
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
