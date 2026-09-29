import { GitFork } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import type { Asset } from "@/lib/asset/server";
import { directConnections, MAX_DEPTH, MIN_DEPTH } from "@/lib/lineage/lineage";
import { getLineage } from "@/lib/lineage/server";
import { cn } from "@/lib/utils";
import type { MyWorkspace } from "@/lib/workspace/server";

import { AddEdgeDialog } from "./add-edge-dialog";
import { LineageConnections } from "./lineage-connections";
import { LineageGraph } from "./lineage-graph";

const DEPTHS = Array.from(
  { length: MAX_DEPTH - MIN_DEPTH + 1 },
  (_, i) => MIN_DEPTH + i,
);

/** The Lineage tab: graph, depth selector, direct connections and pickers. */
export async function LineageTab({
  asset,
  workspace,
  href,
  depth,
  canEdit,
}: {
  asset: Asset;
  workspace: MyWorkspace;
  /** The asset page's path. */
  href: string;
  depth: number;
  canEdit: boolean;
}) {
  const lineage = await getLineage(asset.id, depth);
  const { upstream, downstream } = directConnections(lineage, asset.id);
  const add = canEdit ? (
    <>
      <AddEdgeDialog
        direction="upstream"
        assetId={asset.id}
        assetName={asset.name}
        workspaceId={workspace.id}
      />
      <AddEdgeDialog
        direction="downstream"
        assetId={asset.id}
        assetName={asset.name}
        workspaceId={workspace.id}
      />
    </>
  ) : null;

  if (lineage.edges.length === 0) {
    return (
      <EmptyState
        icon={GitFork}
        title="No lineage yet"
        description={
          canEdit
            ? "Add the assets this one reads from and the ones that read from it."
            : "Nobody has connected this asset to others yet."
        }
        action={add}
      />
    );
  }

  const others = lineage.nodes.length - 1;

  return (
    <section aria-labelledby="lineage-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="lineage-heading" className="text-base font-semibold">
          Lineage
        </h2>
        <p className="text-sm text-muted-foreground">
          {others} connected {others === 1 ? "asset" : "assets"} within {depth}{" "}
          {depth === 1 ? "hop" : "hops"}
        </p>
        <nav aria-label="Depth" className="flex items-center gap-1">
          <span aria-hidden className="mr-1 text-sm text-muted-foreground">
            Depth
          </span>
          {DEPTHS.map((d) => (
            <Link
              key={d}
              href={`${href}?tab=lineage&depth=${d}`}
              aria-current={d === depth ? "true" : undefined}
              aria-label={`Depth ${d}`}
              scroll={false}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-md border text-sm hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                d === depth &&
                  "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {d}
            </Link>
          ))}
        </nav>
        {add && <div className="ml-auto flex flex-wrap gap-2">{add}</div>}
      </div>

      <LineageGraph
        lineage={lineage}
        rootId={asset.id}
        workspaceSlug={workspace.slug}
      />

      <LineageConnections
        assetName={asset.name}
        workspaceSlug={workspace.slug}
        upstream={upstream}
        downstream={downstream}
        canEdit={canEdit}
      />
    </section>
  );
}
