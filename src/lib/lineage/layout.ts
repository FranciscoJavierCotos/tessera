import ELK from "elkjs/lib/elk.bundled.js";

import type { Lineage } from "./lineage";

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 64;

export type Positioned = { id: string; x: number; y: number };

const elk = new ELK();

/**
 * Left-to-right layered layout of a lineage graph (upstream on the left).
 * Returns each node's top-left corner; cycles are laid out too (ELK breaks
 * them for layering).
 */
export async function layoutLineage(lineage: Lineage): Promise<Positioned[]> {
  if (lineage.nodes.length === 0) return [];
  const graph = await elk.layout({
    id: "lineage",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.spacing.nodeNode": "24",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
    },
    children: lineage.nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: lineage.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.from],
      targets: [edge.to],
    })),
  });
  return (graph.children ?? []).map((child) => ({
    id: child.id,
    x: child.x ?? 0,
    y: child.y ?? 0,
  }));
}
