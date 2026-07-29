import { LoadingState } from "@/components/shared/loading-state";

export default function Loading() {
  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-5xl px-4 py-16 sm:px-6">
      <LoadingState label="Loading the academic workspace" />
    </main>
  );
}
