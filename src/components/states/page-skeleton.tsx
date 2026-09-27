import { Page } from "@/components/shell/page";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder for a workspace page while it loads: a header and a list. */
export function PageSkeleton({
  label = "Loading",
  rows = 3,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <Page aria-busy="true" aria-label={label} role="status">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </Page>
  );
}
