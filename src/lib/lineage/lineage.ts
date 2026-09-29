import { z } from "zod";

import { ASSET_KINDS } from "@/lib/asset/kinds";
import { Constants, type Database } from "@/lib/db/types";

export type AssetRelation = Database["public"]["Enums"]["asset_relation"];
export type EdgeSource = Database["public"]["Enums"]["edge_source"];

export const ASSET_RELATIONS = Constants.public.Enums.asset_relation;
export const EDGE_SOURCES = Constants.public.Enums.edge_source;

/** How data moves along an edge; edges always point downstream. */
export const RELATION_LABELS: Record<AssetRelation, string> = {
  feeds: "Feeds",
  reads: "Reads",
  writes: "Writes",
  derived_from: "Derived from",
};

export const EDGE_SOURCE_LABELS: Record<EdgeSource, string> = {
  manual: "Added by hand",
  dbt: "From dbt",
  api: "From the API",
};

export const MIN_DEPTH = 1;
export const MAX_DEPTH = 5;
export const DEFAULT_DEPTH = 2;

/** The `?depth=` search param as a depth in 1–5, else the default. */
export function parseDepth(raw: unknown): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !/^\d$/.test(value)) return DEFAULT_DEPTH;
  const depth = Number(value);
  return depth >= MIN_DEPTH && depth <= MAX_DEPTH ? depth : DEFAULT_DEPTH;
}

const lineageNode = z
  .object({
    id: z.uuid(),
    kind: z.enum(ASSET_KINDS),
    name: z.string(),
    qualified_name: z.string(),
    upstream_depth: z.number().int().nullable(),
    downstream_depth: z.number().int().nullable(),
  })
  .transform((n) => ({
    id: n.id,
    kind: n.kind,
    name: n.name,
    qualifiedName: n.qualified_name,
    upstreamDepth: n.upstream_depth,
    downstreamDepth: n.downstream_depth,
  }));

const lineageEdge = z.object({
  id: z.uuid(),
  from: z.uuid(),
  to: z.uuid(),
  relation: z.enum(ASSET_RELATIONS),
  source: z.enum(EDGE_SOURCES),
});

/** The JSON returned by the `asset_lineage` RPC. */
export const lineageSchema = z.object({
  nodes: z.array(lineageNode),
  edges: z.array(lineageEdge),
});

export type Lineage = z.output<typeof lineageSchema>;
export type LineageNode = Lineage["nodes"][number];
export type LineageEdge = Lineage["edges"][number];

export type Connection = {
  edgeId: string;
  relation: AssetRelation;
  source: EdgeSource;
  node: LineageNode;
};

/**
 * The root's direct neighbours: edges into it (upstream) and out of it
 * (downstream), each with the asset at the other end, by name.
 */
export function directConnections(
  lineage: Lineage,
  rootId: string,
): { upstream: Connection[]; downstream: Connection[] } {
  const byId = new Map(lineage.nodes.map((n) => [n.id, n]));
  const upstream: Connection[] = [];
  const downstream: Connection[] = [];
  for (const edge of lineage.edges) {
    const isInto = edge.to === rootId;
    const isOutOf = edge.from === rootId;
    if (!isInto && !isOutOf) continue;
    const node = byId.get(isInto ? edge.from : edge.to);
    if (!node) continue;
    const connection = {
      edgeId: edge.id,
      relation: edge.relation,
      source: edge.source,
      node,
    };
    (isInto ? upstream : downstream).push(connection);
  }
  const byName = (a: Connection, b: Connection) =>
    a.node.name.localeCompare(b.node.name) ||
    a.relation.localeCompare(b.relation);
  return {
    upstream: upstream.sort(byName),
    downstream: downstream.sort(byName),
  };
}

export const EDGE_DIRECTIONS = ["upstream", "downstream"] as const;
export type EdgeDirection = (typeof EDGE_DIRECTIONS)[number];

/** The add-edge form: link `otherAssetId` upstream or downstream of `assetId`. */
export const addEdgeSchema = z
  .object({
    workspaceId: z.uuid(),
    assetId: z.uuid(),
    otherAssetId: z.uuid({ error: "Choose an asset." }),
    direction: z.enum(EDGE_DIRECTIONS),
    relation: z.enum(ASSET_RELATIONS, { error: "Choose a relation." }),
  })
  .refine((v) => v.assetId !== v.otherAssetId, {
    path: ["otherAssetId"],
    error: "An asset cannot feed itself.",
  });

export type AddEdgeInput = z.output<typeof addEdgeSchema>;

/** The `asset_edges` row for an add-edge input (data flows from → to). */
export function edgeEndpoints(input: AddEdgeInput): {
  from: string;
  to: string;
} {
  return input.direction === "upstream"
    ? { from: input.otherAssetId, to: input.assetId }
    : { from: input.assetId, to: input.otherAssetId };
}

/** The asset-search query: trimmed, 0–100 characters. */
export const assetSearchSchema = z.object({
  workspaceId: z.uuid(),
  excludeId: z.uuid(),
  query: z.string().trim().max(100),
});

/** Escapes `%`, `_` and `\` for an `ilike` pattern. */
export function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
