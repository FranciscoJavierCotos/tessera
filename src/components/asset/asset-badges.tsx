import {
  BrainCircuit,
  LayoutDashboard,
  Server,
  ShieldAlert,
  Table2,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ASSET_KIND_LABELS, type AssetKind } from "@/lib/asset/kinds";
import { cn } from "@/lib/utils";

export const ASSET_KIND_ICONS: Record<AssetKind, LucideIcon> = {
  dataset: Table2,
  dashboard: LayoutDashboard,
  source_system: Server,
  ml_model: BrainCircuit,
};

/** The asset's kind with its icon. */
export function KindBadge({ kind }: { kind: AssetKind }) {
  const Icon = ASSET_KIND_ICONS[kind];
  return (
    <Badge variant="secondary">
      <Icon aria-hidden />
      {ASSET_KIND_LABELS[kind]}
    </Badge>
  );
}

/** Marks a column (or a count of columns) holding personal data. */
export function PiiBadge({
  count,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-amber-500/50 text-amber-700 dark:text-amber-400",
        className,
      )}
      title="Personally identifiable information"
    >
      <ShieldAlert aria-hidden />
      {count === undefined ? "PII" : `${count} PII`}
    </Badge>
  );
}

/** Tags as small outline badges. */
export function TagList({
  tags,
  label = "Tags",
}: {
  tags: string[];
  label?: string;
}) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1" aria-label={label}>
      {tags.map((tag) => (
        <li key={tag}>
          <Badge variant="outline">#{tag}</Badge>
        </li>
      ))}
    </ul>
  );
}
