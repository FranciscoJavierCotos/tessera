import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * What a page or list shows when it has nothing yet: an icon, a heading, one
 * line of copy and an optional call to action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  headingLevel = 2,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  /** Usually a `Button`; several can go in a fragment. */
  action?: React.ReactNode;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon aria-hidden className="size-6 text-muted-foreground" />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <Heading className="font-medium">{title}</Heading>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        <div className="flex flex-wrap justify-center gap-2">{action}</div>
      )}
    </div>
  );
}
