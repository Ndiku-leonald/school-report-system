import { cn } from "@/lib/utils/cn";

type LoadingStateProps = {
  label?: string;
  className?: string;
};

export function LoadingState({
  className,
  label = "Loading content",
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("space-y-4", className)}
    >
      <span className="sr-only">{label}</span>
      <div className="bg-surface-muted h-8 w-2/5 animate-pulse rounded-md" />
      <div className="bg-surface-muted h-4 w-4/5 animate-pulse rounded" />
      <div className="grid gap-4 pt-4 sm:grid-cols-2">
        <div className="bg-surface-muted h-32 animate-pulse rounded-xl" />
        <div className="bg-surface-muted h-32 animate-pulse rounded-xl" />
      </div>
    </div>
  );
}
