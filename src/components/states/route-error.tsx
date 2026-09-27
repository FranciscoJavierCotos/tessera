"use client";

import { CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Body of an `error.tsx` boundary: plain copy plus a retry button. */
export function RouteError({
  title = "Something went wrong",
  description = "We could not load this page. Check your connection and try again.",
  retry,
}: {
  title?: string;
  description?: string;
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <CircleAlert aria-hidden className="size-8 text-destructive" />
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button onClick={() => retry()}>Try again</Button>
    </main>
  );
}
