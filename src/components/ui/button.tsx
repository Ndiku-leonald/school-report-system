import { LoaderCircle } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-sm hover:bg-primary-strong",
  secondary:
    "border border-border bg-surface text-foreground hover:bg-surface-muted",
  ghost: "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
  danger: "bg-danger text-white hover:bg-danger-strong",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
};

export function buttonStyles({
  className,
  size = "md",
  variant = "primary",
}: {
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
} = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-200 outline-none active:translate-y-px disabled:pointer-events-none disabled:opacity-55 focus-visible:ring-3 focus-visible:ring-focus/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    variantStyles[variant],
    sizeStyles[size],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  children: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      disabled,
      loading = false,
      loadingLabel = "Please wait",
      size,
      type = "button",
      variant,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      aria-busy={loading}
      className={buttonStyles({ className, size, variant })}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          <span>{loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  ),
);

Button.displayName = "Button";
