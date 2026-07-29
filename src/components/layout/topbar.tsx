import { Badge } from "@/components/ui/badge";

type TopbarProps = {
  section: string;
};

export function Topbar({ section }: TopbarProps) {
  return (
    <header className="border-border bg-surface/90 flex min-h-16 items-center justify-between border-b px-4 sm:px-6 lg:px-8">
      <div>
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Academic workspace
        </p>
        <p className="text-foreground text-sm font-bold">{section}</p>
      </div>
      <Badge variant="info">Foundation preview</Badge>
    </header>
  );
}
