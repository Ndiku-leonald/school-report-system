import type { FieldError as HookFormFieldError } from "react-hook-form";

import type { StudentActionResult } from "@/lib/student-management/actions";
import { Alert } from "@/components/ui/alert";

export const selectClass =
  "border-border bg-surface text-foreground focus:border-primary focus:ring-focus/20 min-h-11 w-full rounded-lg border px-3 text-sm outline-none focus:ring-3 disabled:cursor-not-allowed disabled:opacity-60";
export const textareaClass =
  "border-border bg-surface text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-focus/20 min-h-24 w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none focus:ring-3";

export function FieldError({
  error,
  message,
}: {
  error?: HookFormFieldError;
  message?: string;
}) {
  const text = message ?? error?.message;
  return text ? (
    <p className="text-danger mt-1 text-xs" role="alert">
      {text}
    </p>
  ) : null;
}

export function ResultMessage({
  result,
}: {
  result: StudentActionResult | null;
}) {
  if (!result) return null;
  return (
    <Alert
      role={result.ok ? "status" : "alert"}
      title={
        result.ok ? "Saved" : result.conflict ? "Refresh required" : "Not saved"
      }
      variant={result.ok ? "success" : "warning"}
    >
      {result.message}
    </Alert>
  );
}
