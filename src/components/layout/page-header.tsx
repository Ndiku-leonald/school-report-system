import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type PageHeaderProps = {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  actions,
  className,
  description,
  eyebrow,
  title,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "border-border flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="text-primary mb-2 text-xs font-bold tracking-[0.16em] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-[65ch] text-sm leading-6 sm:text-base">
          {description}
        </p>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
