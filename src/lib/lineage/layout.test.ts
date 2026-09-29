// @vitest-environment node
import { describe, expect, it } from "vitest";

import { layoutLineage } from "./layout";
import type { Lineage, LineageNode } from "./lineage";

const node = (id: string): LineageNode => ({
  id,
  kind: "dataset",
  name: id,
  qualifiedName: `db.s.${id}`,
  upstreamDepth: null,
  downstreamDepth: null,
});

const edge = (from: string, to: string) => ({
  id: `${from}-${to}`,
  from,
  to,
  relation: "feeds" as const,
  source: "manual" as const,
});

describe("layoutLineage", () => {
  it("returns nothing for an empty graph", async () => {
    expect(await layoutLineage({ nodes: [], edges: [] })).toEqual([]);
  });

  it("lays a chain out left to right", async () => {
    const lineage: Lineage = {
      nodes: [node("raw"), node("stg"), node("mart")],
      edges: [edge("raw", "stg"), edge("stg", "mart")],
    };
    const x = new Map((await layoutLineage(lineage)).map((p) => [p.id, p.x]));
    expect(x.get("raw")).toBeLessThan(x.get("stg")!);
    expect(x.get("stg")).toBeLessThan(x.get("mart")!);
  });

  it("positions every node of a graph with a cycle", async () => {
    const lineage: Lineage = {
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("a", "b"), edge("b", "c"), edge("c", "a")],
    };
    const positions = await layoutLineage(lineage);
    expect(positions.map((p) => p.id).sort()).toEqual(["a", "b", "c"]);
  });
});
