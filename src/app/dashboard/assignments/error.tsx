"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AssignmentsError({ reset }: { reset: () => void }) {
  return (
    <Alert title="Teacher assignments are unavailable" variant="warning">
      <p>The selected-school assignment data could not be loaded.</p>
      <Button className="mt-4" variant="secondary" onClick={reset}>
        Try again
      </Button>
    </Alert>
  );
}
