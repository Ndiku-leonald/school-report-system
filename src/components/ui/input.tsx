import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "border-border bg-surface text-foreground placeholder:text-muted-foreground/70 hover:border-border-strong focus:border-primary focus:ring-focus/20 disabled:bg-surface-muted disabled:text-muted-foreground min-h-11 w-full rounded-lg border px-3.5 py-2.5 text-base shadow-xs transition-colors outline-none focus:ring-3 disabled:cursor-not-allowed sm:text-sm",
        invalid && "border-danger focus:border-danger focus:ring-danger/15",
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = "Input";
