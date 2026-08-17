import type { Database } from "@/types/database.generated";

type Functions = Database["public"]["Functions"];

export type MarksReviewQueueRow =
  Functions["list_marks_review_queue"]["Returns"][number];
export type MarkSheetWorkflowDetail =
  Functions["get_mark_sheet_workflow_detail"]["Returns"][number];
export type MarkSheetWorkflowHistory =
  Functions["get_mark_sheet_workflow_history"]["Returns"][number];
export type TermMarksWorkflow =
  Functions["list_marks_workflow_terms"]["Returns"][number];
export type TermMarksReadiness =
  Functions["get_term_marks_workflow_readiness"]["Returns"][number];

export type MarksWorkflowActionResult =
  | {
      ok: true;
      message: string;
      markSheetId?: string;
      termId?: string;
    }
  | { ok: false; message: string; conflict?: boolean };
