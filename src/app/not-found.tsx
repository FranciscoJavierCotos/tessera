import { FileQuestion } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found · Tessera" };

/** 404 for unmatched URLs and `notFound()` outside more specific boundaries. */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <FileQuestion aria-hidden className="size-8 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          The link may be broken, or the page was moved or deleted.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/">Back to Tessera</Link>
      </Button>
    </main>
  );
}
