import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

type BadgeVariant = "neutral" | "info" | "success" | "warning";

const variants: Record<BadgeVariant, string> = {
  neutral: "bg-surface-muted text-muted-foreground",
  info: "bg-info-soft text-info-strong",
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning-strong",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
