import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import {
  lineageSchema,
  type AssetRelation,
  type Lineage,
} from "@/lib/lineage/lineage";

import {
  createFixtureUser,
  deleteFixtureUsers,
  type FixtureUser,
} from "./fixtures";
import {
  asAnon,
  asUser,
  createAdminClient,
  expectDenied,
  expectRows,
  type TypedClient,
} from "./helpers";

const fx = inject("fixtures");
const { acme, globex } = fx.workspaces;
const admin = createAdminClient();

// Extra acme members for this file: M (owns the private asset) and N.
let m: FixtureUser;
let n: FixtureUser;
let asM: TypedClient;
let asN: TypedClient;
let v: TypedClient;
let b: TypedClient;

// The acme graph (data flows left to right):
//
//   a ─► bb ─► c ─► d ─► e        and c ─► a (a cycle a → bb → c → a)
//         └──► p (private to M) ─► q
const ids: Record<string, string> = {};
let globexAsset: string;

const INSUFFICIENT_PRIVILEGE = "42501";
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";
const INVALID_PARAMETER = "22023";

const qn = (name: string) => `lineage_${fx.runId}.${name}`;

async function lineage(
  client: TypedClient,
  root: string,
  direction: "upstream" | "downstream" | "both",
  maxDepth: number,
): Promise<Lineage> {
  const { data, error } = await client.rpc("asset_lineage", {
    root,
    direction,
    max_depth: maxDepth,
  });
  expect(error).toBeNull();
  return lineageSchema.parse(data);
}

const names = (l: Lineage) =>
  l.nodes.map((node) => node.qualifiedName.split(".").at(-1)).sort();

const edge = (from: string, to: string, relation: AssetRelation = "feeds") => ({
  workspace_id: acme,
  from_asset: ids[from]!,
  to_asset: ids[to]!,
  relation,
});

beforeAll(async () => {
  [m, n] = await Promise.all([
    createFixtureUser(admin, "linm", fx.runId),
    createFixtureUser(admin, "linn", fx.runId),
  ]);
  const members = await admin.from("workspace_members").insert(
    [m, n].map((u) => ({
      workspace_id: acme,
      user_id: u.id,
      role: "member" as const,
    })),
  );
  if (members.error) throw new Error(members.error.message);
  [asM, asN, v, b] = await Promise.all([
    asUser(m),
    asUser(n),
    asUser(fx.users.v),
    asUser(fx.users.b),
  ]);

  for (const name of ["a", "bb", "c", "d", "e", "p", "q"]) {
    const { data, error } = await asM.rpc("create_asset", {
      workspace: acme,
      kind: "dataset",
      name,
      qualified_name: qn(name),
    });
    if (error) throw new Error(error.message);
    ids[name] = data.id;
  }
  const hidden = await admin
    .from("entities")
    .update({ visibility: "private" })
    .eq("id", ids.p!);
  if (hidden.error) throw new Error(hidden.error.message);

  const other = await b.rpc("create_asset", {
    workspace: globex,
    kind: "dataset",
    name: "Other",
    qualified_name: qn("other"),
  });
  if (other.error) throw new Error(other.error.message);
  globexAsset = other.data.id;

  const edges = await asM
    .from("asset_edges")
    .insert([
      edge("a", "bb"),
      edge("bb", "c"),
      edge("c", "a"),
      edge("c", "d"),
      edge("d", "e", "reads"),
      edge("bb", "p"),
      edge("p", "q"),
    ])
    .select("id");
  if (edges.error) throw new Error(edges.error.message);
});

afterAll(async () => {
  await deleteFixtureUsers(admin, [m.id, n.id]);
});

describe("asset_edges", () => {
  it("records who added a manual edge", async () => {
    const [row] = await expectRows(
      asM
        .from("asset_edges")
        .select("source, created_by")
        .eq("from_asset", ids.a!)
        .eq("to_asset", ids.bb!),
    );
    expect(row).toEqual({ source: "manual", created_by: m.id });
  });

  it("rejects a duplicate (from, to, relation) but allows another relation", async () => {
    const dup = await asN.from("asset_edges").insert(edge("a", "bb"));
    expect(dup.error?.code).toBe(UNIQUE_VIOLATION);

    const other = await asN
      .from("asset_edges")
      .insert(edge("a", "bb", "reads"))
      .select("id")
      .single();
    expect(other.error).toBeNull();
    const removed = await asN
      .from("asset_edges")
      .delete()
      .eq("id", other.data!.id)
      .select("id");
    expect(removed.data).toHaveLength(1);
  });

  it("rejects an edge from an asset to itself", async () => {
    const { error } = await asN.from("asset_edges").insert(edge("a", "a"));
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it("users can only add manual edges", async () => {
    await expectDenied(
      asN
        .from("asset_edges")
        .insert({ ...edge("d", "a"), source: "dbt" })
        .select(),
    );
  });

  it("an edge cannot cross workspaces", async () => {
    const { error } = await asM.from("asset_edges").insert({
      workspace_id: acme,
      from_asset: ids.a!,
      to_asset: globexAsset,
    });
    expect([FOREIGN_KEY_VIOLATION, INSUFFICIENT_PRIVILEGE]).toContain(
      error?.code,
    );
  });

  it("a workspace viewer reads edges but cannot add or remove them", async () => {
    const rows = await expectRows(
      v.from("asset_edges").select("id").eq("from_asset", ids.a!),
    );
    expect(rows).toHaveLength(1);
    await expectDenied(v.from("asset_edges").insert(edge("e", "a")).select());
    await expectDenied(
      v.from("asset_edges").delete().eq("from_asset", ids.a!).select(),
    );
  });

  it("edges to a private asset are hidden from other members", async () => {
    const mine = await expectRows(
      asM.from("asset_edges").select("id").in("to_asset", [ids.p!, ids.q!]),
    );
    expect(mine).toHaveLength(2);
    const theirs = await expectRows(
      asN.from("asset_edges").select("id").in("to_asset", [ids.p!, ids.q!]),
    );
    expect(theirs).toHaveLength(0);
    await expectDenied(
      asN.from("asset_edges").delete().eq("to_asset", ids.p!).select(),
    );
  });

  it("edges are never edited", async () => {
    const { error } = await asM
      .from("asset_edges")
      .update({ relation: "writes" })
      .eq("from_asset", ids.a!)
      .select();
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it("another workspace and the anonymous role see no edge", async () => {
    await expectDenied(
      b.from("asset_edges").select("id").eq("from_asset", ids.a!),
    );
    await expectDenied(
      asAnon().from("asset_edges").select("id").eq("from_asset", ids.a!),
    );
  });

  it("deleting an asset removes its edges", async () => {
    const { data: x } = await asM.rpc("create_asset", {
      workspace: acme,
      kind: "dashboard",
      name: "Temp",
      qualified_name: qn("temp"),
    });
    await asM
      .from("asset_edges")
      .insert({ workspace_id: acme, from_asset: ids.e!, to_asset: x!.id });
    const deleted = await asM
      .from("entities")
      .delete()
      .eq("id", x!.id)
      .select("id");
    expect(deleted.data).toHaveLength(1);
    const left = await admin
      .from("asset_edges")
      .select("id")
      .eq("to_asset", x!.id);
    expect(left.data).toHaveLength(0);
  });
});

describe("asset_lineage", () => {
  it("walks downstream through a cycle without looping", async () => {
    const result = await lineage(asM, ids.a!, "downstream", 5);
    expect(names(result)).toEqual(["a", "bb", "c", "d", "e", "p", "q"]);
    const depth = Object.fromEntries(
      result.nodes.map((node) => [node.qualifiedName.split(".").at(-1), node]),
    );
    expect(depth.a?.downstreamDepth).toBe(0);
    expect(depth.bb?.downstreamDepth).toBe(1);
    expect(depth.c?.downstreamDepth).toBe(2);
    expect(depth.e?.downstreamDepth).toBe(4);
    // Every edge appears once even though the cycle is walked repeatedly.
    expect(result.edges).toHaveLength(7);
    expect(new Set(result.edges.map((e) => e.id)).size).toBe(7);
  });

  it("walks upstream through the same cycle", async () => {
    const result = await lineage(asM, ids.d!, "upstream", 5);
    expect(names(result)).toEqual(["a", "bb", "c", "d"]);
    expect(result.edges.map((e) => [e.from, e.to])).toEqual(
      expect.arrayContaining([
        [ids.c, ids.d],
        [ids.bb, ids.c],
        [ids.a, ids.bb],
        [ids.c, ids.a],
      ]),
    );
    expect(result.edges).toHaveLength(4);
  });

  it("stops at max_depth", async () => {
    const one = await lineage(asM, ids.c!, "downstream", 1);
    expect(names(one)).toEqual(["a", "c", "d"]);
    expect(one.edges).toHaveLength(2);

    const both = await lineage(asM, ids.c!, "both", 1);
    expect(names(both)).toEqual(["a", "bb", "c", "d"]);
    const root = both.nodes.find((node) => node.id === ids.c);
    expect(root).toMatchObject({ upstreamDepth: 0, downstreamDepth: 0 });
    // `a` is one hop downstream (c → a) and two hops upstream (a → bb → c):
    // only the downstream side reaches it at depth 1.
    const a = both.nodes.find((node) => node.id === ids.a);
    expect(a).toMatchObject({ upstreamDepth: null, downstreamDepth: 1 });
  });

  it("never walks into an asset the caller cannot read", async () => {
    const result = await lineage(asN, ids.bb!, "downstream", 5);
    expect(names(result)).not.toContain("p");
    // q is only reachable through the private p.
    expect(names(result)).not.toContain("q");
    expect(result.edges.some((e) => e.to === ids.p || e.from === ids.p)).toBe(
      false,
    );
  });

  it("a workspace viewer reads the lineage", async () => {
    const result = await lineage(v, ids.a!, "both", 2);
    expect(names(result)).toContain("bb");
  });

  it("refuses a root the caller cannot read", async () => {
    for (const [client, root] of [
      [asN, ids.p!],
      [b, ids.a!],
    ] as const) {
      const { error } = await client.rpc("asset_lineage", {
        root,
        direction: "both",
        max_depth: 2,
      });
      expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    }
    const anon = await asAnon().rpc("asset_lineage", { root: ids.a! });
    expect(anon.error).not.toBeNull();
  });

  it("validates direction and max_depth", async () => {
    for (const args of [
      { direction: "sideways", max_depth: 2 },
      { direction: "both", max_depth: 0 },
      { direction: "both", max_depth: 6 },
    ]) {
      const { error } = await asM.rpc("asset_lineage", {
        root: ids.a!,
        ...args,
      });
      expect(error?.code).toBe(INVALID_PARAMETER);
    }
  });
});
