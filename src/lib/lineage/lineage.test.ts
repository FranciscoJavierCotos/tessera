import { describe, expect, it } from "vitest";

import {
  addEdgeSchema,
  DEFAULT_DEPTH,
  directConnections,
  edgeEndpoints,
  likePattern,
  lineageSchema,
  parseDepth,
} from "./lineage";

const ids = {
  root: "00000000-0000-4000-8000-000000000001",
  up: "00000000-0000-4000-8000-000000000002",
  down: "00000000-0000-4000-8000-000000000003",
  far: "00000000-0000-4000-8000-000000000004",
  e1: "00000000-0000-4000-8000-0000000000e1",
  e2: "00000000-0000-4000-8000-0000000000e2",
  e3: "00000000-0000-4000-8000-0000000000e3",
  ws: "00000000-0000-4000-8000-0000000000aa",
};

const node = (
  id: string,
  name: string,
  up: number | null,
  down: number | null,
) => ({
  id,
  kind: "dataset",
  name,
  qualified_name: `db.s.${name}`,
  upstream_depth: up,
  downstream_depth: down,
});

const raw = {
  nodes: [
    node(ids.root, "orders", 0, 0),
    node(ids.up, "raw_orders", 1, null),
    node(ids.down, "revenue", null, 1),
    node(ids.far, "board", null, 2),
  ],
  edges: [
    {
      id: ids.e1,
      from: ids.up,
      to: ids.root,
      relation: "feeds",
      source: "manual",
    },
    {
      id: ids.e2,
      from: ids.root,
      to: ids.down,
      relation: "reads",
      source: "dbt",
    },
    {
      id: ids.e3,
      from: ids.down,
      to: ids.far,
      relation: "feeds",
      source: "api",
    },
  ],
};

describe("parseDepth", () => {
  it.each([
    ["1", 1],
    ["5", 5],
    [["3", "4"], 3],
  ])("accepts %j", (value, expected) => {
    expect(parseDepth(value)).toBe(expected);
  });

  it.each([undefined, "", "0", "6", "10", "2.5", "abc", -1])(
    "falls back to the default for %j",
    (value) => {
      expect(parseDepth(value)).toBe(DEFAULT_DEPTH);
    },
  );
});

describe("lineageSchema", () => {
  it("maps the RPC's JSON to camelCase nodes", () => {
    const lineage = lineageSchema.parse(raw);
    expect(lineage.nodes[1]).toEqual({
      id: ids.up,
      kind: "dataset",
      name: "raw_orders",
      qualifiedName: "db.s.raw_orders",
      upstreamDepth: 1,
      downstreamDepth: null,
    });
    expect(lineage.edges).toHaveLength(3);
  });

  it("rejects an unknown relation", () => {
    const bad = { ...raw, edges: [{ ...raw.edges[0], relation: "copies" }] };
    expect(lineageSchema.safeParse(bad).success).toBe(false);
  });
});

describe("directConnections", () => {
  it("splits the root's own edges into upstream and downstream", () => {
    const { upstream, downstream } = directConnections(
      lineageSchema.parse(raw),
      ids.root,
    );
    expect(upstream.map((c) => [c.node.name, c.relation])).toEqual([
      ["raw_orders", "feeds"],
    ]);
    expect(downstream.map((c) => [c.node.name, c.relation, c.source])).toEqual([
      ["revenue", "reads", "dbt"],
    ]);
  });

  it("lists a neighbour on both sides of a two-node cycle", () => {
    const cycle = lineageSchema.parse({
      nodes: [node(ids.root, "a", 0, 0), node(ids.up, "b", 1, 1)],
      edges: [
        {
          id: ids.e1,
          from: ids.up,
          to: ids.root,
          relation: "feeds",
          source: "manual",
        },
        {
          id: ids.e2,
          from: ids.root,
          to: ids.up,
          relation: "feeds",
          source: "manual",
        },
      ],
    });
    const { upstream, downstream } = directConnections(cycle, ids.root);
    expect(upstream).toHaveLength(1);
    expect(downstream).toHaveLength(1);
  });
});

describe("addEdgeSchema and edgeEndpoints", () => {
  const input = {
    workspaceId: ids.ws,
    assetId: ids.root,
    otherAssetId: ids.up,
    direction: "upstream",
    relation: "feeds",
  };

  it("points an upstream edge at the asset", () => {
    const parsed = addEdgeSchema.parse(input);
    expect(edgeEndpoints(parsed)).toEqual({ from: ids.up, to: ids.root });
  });

  it("points a downstream edge away from the asset", () => {
    const parsed = addEdgeSchema.parse({ ...input, direction: "downstream" });
    expect(edgeEndpoints(parsed)).toEqual({ from: ids.root, to: ids.up });
  });

  it("rejects linking an asset to itself", () => {
    const result = addEdgeSchema.safeParse({
      ...input,
      otherAssetId: ids.root,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["otherAssetId"]);
  });

  it("asks for an asset and a relation", () => {
    const result = addEdgeSchema.safeParse({
      ...input,
      otherAssetId: "",
      relation: "",
    });
    const messages = result.error?.issues.map((i) => i.message);
    expect(messages).toContain("Choose an asset.");
    expect(messages).toContain("Choose a relation.");
  });
});

describe("likePattern", () => {
  it("wraps the query and escapes wildcards", () => {
    expect(likePattern("fct_orders")).toBe("%fct\\_orders%");
    expect(likePattern("100%")).toBe("%100\\%%");
    expect(likePattern("a\\b")).toBe("%a\\\\b%");
  });
});
