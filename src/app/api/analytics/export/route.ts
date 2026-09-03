import { NextRequest } from "next/server";
import { z } from "zod";

import {
  getAnalyticsExportData,
  getAnalyticsGrade,
} from "@/lib/analytics/data";
import { csvRow, safeExportFilename } from "@/lib/analytics/format";

const querySchema = z.object({
  run: z.string().uuid(),
  type: z.enum(["summary", "distributions", "subjects"]),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    run: request.nextUrl.searchParams.get("run"),
    type: request.nextUrl.searchParams.get("type"),
  });
  if (!parsed.success) return new Response("Not found", { status: 404 });

  const grade = await getAnalyticsGrade(parsed.data.run);
  if (!grade) {
    return new Response("Analytics scope is unavailable.", {
      status: 409,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const data = await getAnalyticsExportData(parsed.data.run, parsed.data.type);
  const lines: string[] = [];
  if (parsed.data.type === "summary" && data.grade) {
    lines.push(
      csvRow([
        "Scope",
        "Class",
        "Learners",
        "Complete",
        "Incomplete",
        "Average population",
        "Mean overall average",
        "Ranking eligible",
        "Graded",
        "Classified",
      ]),
    );
    for (const item of data.classes) {
      lines.push(
        csvRow([
          "Grade",
          item.class_name,
          item.analytics_population,
          item.complete_count,
          item.incomplete_count,
          item.average_population_count,
          item.mean_overall_average,
          item.ranking_eligible_count,
          item.graded_count,
          item.aggregate_classified_count,
        ]),
      );
    }
    lines.push(
      csvRow([
        "Grade total",
        "",
        data.grade.analytics_population,
        data.grade.complete_count,
        data.grade.incomplete_count,
        data.grade.average_population_count,
        data.grade.mean_overall_average,
        data.grade.ranking_eligible_count,
        data.grade.graded_count,
        data.grade.aggregate_classified_count,
      ]),
    );
  } else if (parsed.data.type === "distributions") {
    lines.push(
      csvRow([
        "Distribution",
        "Label",
        "Count",
        "Percentage",
        "Denominator",
        "Ungraded",
        "Unclassified",
      ]),
    );
    for (const item of data.distributions ?? [])
      lines.push(
        csvRow([
          item.distribution_type,
          item.label,
          item.row_count,
          item.percentage,
          item.distribution_population,
          item.ungraded_count,
          item.unclassified_count,
        ]),
      );
  } else if (parsed.data.type === "subjects") {
    lines.push(
      csvRow([
        "Subject",
        "Mean score",
        "Minimum score",
        "Maximum score",
        "Pass rate",
        "Complete",
        "Incomplete",
        "Exempted",
      ]),
    );
    for (const item of data.subjects ?? [])
      lines.push(
        csvRow([
          item.subject_name,
          item.mean_score,
          item.minimum_score,
          item.maximum_score,
          item.pass_rate,
          item.complete_count,
          item.incomplete_count,
          item.exempted_count,
        ]),
      );
  }

  const body = `${lines.join("\r\n")}\r\n`;
  const filename = safeExportFilename(
    `${grade.academic_year_name}-${grade.term_name}-${grade.grade_name}-${parsed.data.type}`,
  );
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
