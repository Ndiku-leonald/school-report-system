"use client";

import { useState, useTransition } from "react";

import {
  transitionConfiguration,
  type ConfigurationTransition,
} from "@/lib/academic-configuration/actions";

import { Button } from "../ui/button";

export function ConfigurationTransitionButton({
  expectedUpdatedAt,
  id,
  label,
  transition,
  variant = "secondary",
}: {
  expectedUpdatedAt: string;
  id: string;
  label: string;
  transition: ConfigurationTransition;
  variant?: "primary" | "secondary" | "danger";
}) {
  const [message, setMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="text-right">
      <Button
        size="sm"
        variant={variant}
        disabled={isPending}
        onClick={() => {
          if (!window.confirm(`Confirm: ${label.toLowerCase()}?`)) return;
          startTransition(async () => {
            const result = await transitionConfiguration(
              transition,
              id,
              expectedUpdatedAt,
            );
            setMessage(result.message);
          });
        }}
      >
        {isPending ? "Saving…" : label}
      </Button>
      {message ? (
        <p
          role="status"
          className="text-muted-foreground mt-1 max-w-40 text-xs"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
