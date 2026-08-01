import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type ConfigurationListItem = {
  action?: ReactNode;
  editor?: ReactNode;
  id: string;
  title: string;
  description: string;
  status?: string;
  meta?: ReactNode;
};

export function ConfigurationList({
  empty,
  items,
}: {
  empty: string;
  items: ConfigurationListItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="border-border-strong text-muted-foreground rounded-xl border border-dashed px-5 py-9 text-center text-sm">
        {empty}
      </div>
    );
  }

  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-foreground font-semibold">{item.title}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {item.description}
                  </p>
                  {item.meta ? (
                    <div className="text-muted-foreground mt-2 text-xs">
                      {item.meta}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  {item.status ? <Badge>{item.status}</Badge> : null}
                  {item.action}
                </div>
              </div>
              {item.editor ? (
                <div className="border-border mt-4 border-t pt-4">
                  {item.editor}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
