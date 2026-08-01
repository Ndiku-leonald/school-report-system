import { notFound } from "next/navigation";

import { ConfigurationList } from "@/components/academic-configuration/configuration-list";
import { TermEditForm } from "@/components/academic-configuration/entity-management-forms";
import { StructuredCreateForm } from "@/components/academic-configuration/structured-create-form";
import { ConfigurationTransitionButton } from "@/components/academic-configuration/transition-button";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicConfigurationData } from "@/lib/academic-configuration/data";

export default async function AcademicYearDetailPage({
  params,
}: {
  params: Promise<{ yearId: string }>;
}) {
  const { yearId } = await params;
  const data = await getAcademicConfigurationData();
  const year = data.years.find((item) => item.id === yearId);
  if (!year) notFound();
  const terms = data.terms.filter((term) => term.academic_year_id === year.id);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Academic year"
        title={year.name}
        description={`${year.starts_on} – ${year.ends_on}. Terms are not limited to a fixed school model.`}
        actions={<Badge>{year.status}</Badge>}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ConfigurationList
          empty="No terms have been added to this academic year."
          items={terms.map((term) => ({
            id: term.id,
            title: `${term.term_number}. ${term.name}`,
            description: `${term.starts_on} – ${term.ends_on}`,
            status: term.status,
            action:
              data.canManage && term.status === "DRAFT" ? (
                <ConfigurationTransitionButton
                  id={term.id}
                  expectedUpdatedAt={term.updated_at}
                  label="Open term"
                  transition="open-term"
                />
              ) : undefined,
            editor:
              data.canManage && term.status === "DRAFT" ? (
                <TermEditForm
                  term={{
                    id: term.id,
                    name: term.name,
                    termNumber: term.term_number,
                    startsOn: term.starts_on,
                    endsOn: term.ends_on,
                    isPromotionTerm: term.is_promotion_term,
                    updatedAt: term.updated_at,
                  }}
                />
              ) : undefined,
            meta: term.is_promotion_term ? "Promotion term" : undefined,
          }))}
        />
        {data.canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Add term</CardTitle>
            </CardHeader>
            <CardContent>
              <StructuredCreateForm
                kind="term"
                years={[{ id: year.id, label: year.name }]}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
