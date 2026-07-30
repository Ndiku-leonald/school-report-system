import type { FieldError as ReactHookFormFieldError } from "react-hook-form";
import type { ReactNode } from "react";

import type { ConfigurationActionResult } from "@/lib/academic-configuration/actions";

import { Alert } from "../ui/alert";

export const selectClass =
  "border-border bg-surface text-foreground focus:border-primary focus:ring-focus/20 min-h-11 w-full rounded-lg border px-3 text-sm outline-none focus:ring-3 disabled:cursor-not-allowed disabled:opacity-60";

export function ResultMessage({
  result,
}: {
  result: ConfigurationActionResult | null;
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

export function FieldError({
  error,
  message,
}: {
  error?: ReactHookFormFieldError;
  message?: string;
}) {
  const text = message ?? error?.message;
  return text ? (
    <p className="text-danger mt-1 text-xs" role="alert">
      {text}
    </p>
  ) : null;
}

export function EditDisclosure({
  children,
  label = "Edit",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <details>
      <summary className="text-primary focus-visible:ring-focus/30 inline-flex min-h-9 cursor-pointer items-center rounded-md px-1 text-sm font-semibold outline-none hover:underline focus-visible:ring-3">
        {label}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}
