"use client";

import { Button } from "@/components/ui/button";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-[100dvh] items-center justify-center bg-[#f5f7f6] px-4 py-16 text-[#17211f]">
          <section className="w-full max-w-lg rounded-xl border border-[#dce5e2] bg-white p-8 text-center">
            <h1 className="text-xl font-bold">
              The application needs a restart
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#5f6f6a]">
              No technical details have been displayed. Try again, then contact
              an administrator if the issue continues.
            </p>
            <Button className="mt-6" onClick={reset}>
              Try again
            </Button>
          </section>
        </main>
      </body>
    </html>
  );
}
