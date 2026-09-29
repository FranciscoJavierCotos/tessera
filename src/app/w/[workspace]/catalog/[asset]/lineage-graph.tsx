"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { CircleAlert } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ASSET_KIND_ICONS } from "@/components/asset/asset-badges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ASSET_KIND_LABELS } from "@/lib/asset/kinds";
import { assetPath } from "@/lib/asset/paths";
import {
  layoutLineage,
  NODE_HEIGHT,
  NODE_WIDTH,
  type Positioned,
} from "@/lib/lineage/layout";
import {
  RELATION_LABELS,
  type Lineage,
  type LineageNode,
} from "@/lib/lineage/lineage";
import { cn } from "@/lib/utils";

type AssetNodeData = { asset: LineageNode; href: string; isRoot: boolean };
type AssetFlowNode = Node<AssetNodeData, "asset">;

const nodeTypes = { asset: AssetNode };

/**
 * The lineage around an asset, laid out left to right with ELK (upstream on
 * the left). Each node links to its asset; the root is highlighted.
 */
export function LineageGraph({
  lineage,
  rootId,
  workspaceSlug,
}: {
  lineage: Lineage;
  rootId: string;
  workspaceSlug: string;
}) {
  const { resolvedTheme } = useTheme();
  const [layout, setLayout] = useState<{
    for: Lineage;
    positions: Positioned[] | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    layoutLineage(lineage).then(
      (positions) => !cancelled && setLayout({ for: lineage, positions }),
      () => !cancelled && setLayout({ for: lineage, positions: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [lineage]);

  if (layout?.for !== lineage) {
    return (
      <Skeleton
        role="status"
        aria-label="Drawing the lineage graph"
        className="h-[28rem] w-full rounded-xl"
      />
    );
  }
  if (!layout.positions) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden />
        <AlertTitle>Could not draw the graph</AlertTitle>
        <AlertDescription>
          The connections are still listed below.
        </AlertDescription>
      </Alert>
    );
  }

  const byId = new Map(layout.positions.map((p) => [p.id, p]));
  const nodes: AssetFlowNode[] = lineage.nodes.map((asset) => ({
    id: asset.id,
    type: "asset",
    position: { x: byId.get(asset.id)?.x ?? 0, y: byId.get(asset.id)?.y ?? 0 },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    // Not selectable nor draggable, so React Flow would drop pointer events;
    // the node's link must stay clickable.
    style: { pointerEvents: "all" },
    data: {
      asset,
      href: assetPath(workspaceSlug, asset.qualifiedName) + "?tab=lineage",
      isRoot: asset.id === rootId,
    },
  }));
  const names = new Map(lineage.nodes.map((n) => [n.id, n.name]));
  const edges: Edge[] = lineage.edges.map((edge) => ({
    id: edge.id,
    ariaLabel: `${names.get(edge.from)} to ${names.get(edge.to)}: ${RELATION_LABELS[edge.relation]}`,
    source: edge.from,
    target: edge.to,
    label: RELATION_LABELS[edge.relation],
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: edge.source !== "manual",
  }));

  return (
    <div className="h-[28rem] w-full overflow-hidden rounded-xl border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.1}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        aria-label="Lineage graph"
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function AssetNode({ data }: NodeProps<AssetFlowNode>) {
  const { asset, href, isRoot } = data;
  const Icon = ASSET_KIND_ICONS[asset.kind];
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Link
        href={href}
        aria-current={isRoot ? "page" : undefined}
        className={cn(
          "flex h-full w-full items-center gap-2 rounded-lg border bg-card px-3 text-card-foreground shadow-xs hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          isRoot && "border-2 border-primary",
        )}
      >
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-col text-left">
          <span className="truncate text-sm font-medium">
            {asset.name}
            <span className="sr-only">
              {`, ${ASSET_KIND_LABELS[asset.kind]}`}
              {isRoot && ", this asset"}
            </span>
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {asset.qualifiedName}
          </span>
        </span>
      </Link>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}
