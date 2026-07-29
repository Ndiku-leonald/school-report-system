import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

type AlertVariant = "info" | "success" | "warning";

const alertStyles: Record<AlertVariant, string> = {
  info: "border-info/25 bg-info-soft text-info-strong",
  success: "border-success/25 bg-success-soft text-success-strong",
  warning: "border-warning/25 bg-warning-soft text-warning-strong",
};

const alertIcons = {
  info: Info,
  success: CircleCheck,
  warning: CircleAlert,
};

type AlertProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  variant?: AlertVariant;
};

export function Alert({
  children,
  className,
  title,
  variant = "info",
  ...props
}: AlertProps) {
  const Icon = alertIcons[variant];

  return (
    <div
      role="status"
      className={cn(
        "flex gap-3 rounded-lg border p-4 text-sm",
        alertStyles[variant],
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        <div className="leading-6 opacity-90">{children}</div>
      </div>
    </div>
  );
}
