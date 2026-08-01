import Link from "next/link";

import { ConfigurationList } from "@/components/academic-configuration/configuration-list";
import { AcademicYearEditForm } from "@/components/academic-configuration/entity-management-forms";
import { AcademicYearCreateForm } from "@/components/academic-configuration/quick-create-forms";
import { ConfigurationTransitionButton } from "@/components/academic-configuration/transition-button";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicConfigurationData } from "@/lib/academic-configuration/data";

export default async function AcademicYearsPage() {
  const data = await getAcademicConfigurationData();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Calendar"
        title="Academic years and terms"
        description="Create flexible school calendars and explicitly advance reviewed year and term states."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ConfigurationList
          empty="No academic years have been configured for this school."
          items={data.years.map((year) => ({
            id: year.id,
            title: year.name,
            description: `${year.starts_on} – ${year.ends_on}`,
            status: year.status,
            action:
              data.canManage && year.status !== "ARCHIVED" ? (
                <ConfigurationTransitionButton
                  id={year.id}
                  expectedUpdatedAt={year.updated_at}
                  label={
                    year.status === "DRAFT"
                      ? "Activate"
                      : year.status === "ACTIVE"
                        ? "Close"
                        : "Archive"
                  }
                  transition={
                    year.status === "DRAFT"
                      ? "activate-year"
                      : year.status === "ACTIVE"
                        ? "close-year"
                        : "archive-year"
                  }
                  variant={year.status === "DRAFT" ? "primary" : "secondary"}
                />
              ) : undefined,
            editor:
              data.canManage && year.status === "DRAFT" ? (
                <AcademicYearEditForm
                  year={{
                    id: year.id,
                    name: year.name,
                    startsOn: year.starts_on,
                    endsOn: year.ends_on,
                    updatedAt: year.updated_at,
                  }}
                />
              ) : undefined,
            meta: (
              <Link
                className="text-primary font-semibold hover:underline"
                href={`/dashboard/academic/years/${year.id}`}
              >
                View year and terms
              </Link>
            ),
          }))}
        />
        {data.canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Create academic year</CardTitle>
            </CardHeader>
            <CardContent>
              <AcademicYearCreateForm />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
