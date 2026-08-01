"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function StudentsError({ reset }: { reset: () => void }) {
  return (
    <Alert title="Student records are unavailable" variant="warning">
      <p>The selected school’s records could not be loaded safely.</p>
      <Button className="mt-3" size="sm" variant="secondary" onClick={reset}>
        Try again
      </Button>
    </Alert>
  );
}
