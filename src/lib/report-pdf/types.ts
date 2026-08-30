import type {
  GeneratedReport,
  ReportSubjectSnapshot,
} from "@/lib/report-snapshots/types";

export type ReportPdfData = {
  report: GeneratedReport;
  subjects: readonly ReportSubjectSnapshot[];
};
