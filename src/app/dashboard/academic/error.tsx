"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AcademicConfigurationError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <Alert title="Academic configuration is unavailable" variant="warning">
      <p>The selected school configuration could not be loaded safely.</p>
      <Button className="mt-3" onClick={reset} size="sm" variant="secondary">
        Try again
      </Button>
    </Alert>
  );
}
