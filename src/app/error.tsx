"use client";

import { CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorBoundary({ reset }: ErrorBoundaryProps) {
  return (
    <main className="bg-background flex min-h-[100dvh] items-center justify-center px-4 py-16">
      <section className="border-border bg-surface w-full max-w-lg rounded-xl border p-6 text-center shadow-sm sm:p-8">
        <span className="bg-warning-soft text-warning-strong mx-auto flex size-11 items-center justify-center rounded-lg">
          <CircleAlert aria-hidden="true" className="size-5" />
        </span>
        <h1 className="text-foreground mt-5 text-xl font-bold">
          This page could not be loaded
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Try the request again. If the problem continues, contact an
          administrator without sharing passwords or student information.
        </p>
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </section>
    </main>
  );
}
