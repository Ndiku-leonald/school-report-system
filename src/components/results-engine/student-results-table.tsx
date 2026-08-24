import Link from "next/link";

import type { CalculatedStudent } from "@/lib/results-engine/types";

export function StudentResultsTable({
  runId,
  students,
}: {
  runId: string;
  students: CalculatedStudent[];
}) {
  return (
    <div className="border-border overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="bg-surface-muted text-muted-foreground text-xs tracking-wide uppercase">
          <tr>
            <th className="px-4 py-3">Admission</th>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Class</th>
            <th className="px-4 py-3">Total</th>
            <th className="px-4 py-3">Average</th>
            <th className="px-4 py-3">Grade</th>
            <th className="px-4 py-3">Aggregate</th>
            <th className="px-4 py-3">Class position</th>
            <th className="px-4 py-3">Grade position</th>
            <th className="px-4 py-3">Eligible</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {students.map((student) => (
            <tr
              key={student.enrollment_id}
              className="hover:bg-surface-muted/60"
            >
              <td className="px-4 py-3 font-mono text-xs">
                <Link
                  className="text-primary font-semibold hover:underline"
                  href={`/dashboard/results/${runId}/students/${student.enrollment_id}`}
                >
                  {student.admission_number}
                </Link>
              </td>
              <td className="px-4 py-3 font-semibold">
                {student.student_name}
              </td>
              <td className="px-4 py-3">{student.class_name}</td>
              <td className="px-4 py-3 font-mono">
                {student.overall_total ?? "—"}
              </td>
              <td className="px-4 py-3 font-mono">
                {student.overall_average ?? "—"}
              </td>
              <td className="px-4 py-3">{student.overall_grade ?? "—"}</td>
              <td className="px-4 py-3">
                {student.aggregate_total ?? "—"}
                {student.aggregate_classification ? (
                  <span className="text-muted-foreground ml-1 text-xs">
                    {student.aggregate_classification}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3">
                {student.class_position ?? "—"}
                {student.class_is_tied ? (
                  <span className="text-muted-foreground ml-1 text-xs">
                    tie {student.class_tie_size}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3">
                {student.grade_level_position ?? "—"}
                {student.grade_level_is_tied ? (
                  <span className="text-muted-foreground ml-1 text-xs">
                    tie {student.grade_level_tie_size}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3">
                {student.ranking_eligible ? "Yes" : "No"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
