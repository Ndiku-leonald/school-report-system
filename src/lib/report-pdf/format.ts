import type { GeneratedReport } from "@/lib/report-snapshots/types";

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function pdfText(value: unknown, fallback = "Unavailable") {
  if (value === null || value === undefined || value === "") return fallback;
  const text = String(value).replace(CONTROL_CHARACTERS, "").trim();
  return text || fallback;
}

export function pdfNumber(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "Unavailable"
    : String(value);
}

export function pdfDate(value: string | null | undefined) {
  if (!value) return "Unavailable";
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? "Unavailable";
}

export function pdfSubjectStatus(
  status: string | null | undefined,
  hasAbsence: boolean,
  hasExemption: boolean,
) {
  // The frozen Stage 11 status is authoritative. The flags explain that
  // status; they must not turn a valid COMPLETE result into a different
  // academic state.
  if (status === "EXEMPTED") return "Exempted";
  if (status === "INCOMPLETE") return "Incomplete";
  if (status === "COMPLETE") {
    return hasAbsence ? "Complete · absence recorded" : "Complete";
  }
  if (hasExemption) return "Exemption recorded";
  if (hasAbsence) return "Absence recorded";
  return pdfText(status);
}

export function pdfPosition(
  position: number | null | undefined,
  isTied: boolean,
  tieSize: number,
) {
  const value = pdfNumber(position);
  if (value === "Unavailable" || !isTied) return value;
  return tieSize > 1 ? `${value} (tie of ${tieSize})` : `${value} (tie)`;
}

export function safeReportFilename(report: GeneratedReport) {
  const snapshot = report.snapshot_data;
  const parts = [
    snapshot.student.admission_number,
    snapshot.student.display_name,
    snapshot.academic_period.academic_year_name,
    snapshot.academic_period.term_name,
  ];
  const name = parts
    .map((part) =>
      pdfText(part, "report")
        .normalize("NFKD")
        .replace(/[^\x20-\x7E]/g, "")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/[ ._-]{2,}/g, "-")
        .replace(/^[ ._-]+|[ ._-]+$/g, "")
        .slice(0, 48),
    )
    .filter(Boolean)
    .join("-");
  return `${(name || "report-card").slice(0, 150)}-v${report.report_version}.pdf`;
}

export function contentDisposition(filename: string) {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 180);
  return `attachment; filename="${safe}"`;
}
