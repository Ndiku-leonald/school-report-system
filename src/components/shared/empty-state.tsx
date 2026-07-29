import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type EmptyStateProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  action,
  className,
  description,
  icon: Icon,
  title,
}: EmptyStateProps) {
  return (
    <section
      className={cn(
        "border-border-strong bg-surface/60 rounded-xl border border-dashed px-5 py-10 text-center sm:px-8",
        className,
      )}
    >
      <span className="bg-primary-soft text-primary mx-auto flex size-11 items-center justify-center rounded-lg">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <h2 className="text-foreground mt-4 text-base font-bold">{title}</h2>
      <p className="text-muted-foreground mx-auto mt-2 max-w-lg text-sm leading-6">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}
