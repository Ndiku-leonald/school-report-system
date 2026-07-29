import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";

type TopbarProps = {
  schoolName: string;
  section: string;
  staffName: string;
};

export function Topbar({ schoolName, section, staffName }: TopbarProps) {
  return (
    <header className="border-border bg-surface/90 flex min-h-16 items-center justify-between border-b px-4 sm:px-6 lg:px-8">
      <div>
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {schoolName}
        </p>
        <p className="text-foreground text-sm font-bold">{section}</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="info">{staffName}</Badge>
        <form action={signOutAction}>
          <Button type="submit" size="sm" variant="ghost">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
