import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

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

// Extra acme users for this file:
// | User | Workspace role | Project role (private project)  |
// | ---- | -------------- | ------------------------------- |
// | M    | member         | lead (creator)                  |
// | C    | member         | contributor                     |
// | P    | member         | viewer                          |
// | N    | member         | — (outsider)                    |
let m: FixtureUser;
let c: FixtureUser;
let p: FixtureUser;
let n: FixtureUser;

let asM: TypedClient;
let asC: TypedClient;
let asP: TypedClient;
let asN: TypedClient;
let v: TypedClient;
let b: TypedClient;

let datasetId: string;
let dashboardId: string;
let projectId: string;

const INSUFFICIENT_PRIVILEGE = "42501";
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";

const qn = (name: string) => `rls_${fx.runId}.${name}`;

const COLUMNS = [
  { name: "order_id", data_type: "bigint", description: "Key", is_pii: false },
  { name: "email", data_type: "text", description: "", is_pii: true },
];

beforeAll(async () => {
  const user = (name: string) =>
    createFixtureUser(admin, `asset${name}`, fx.runId);
  [m, c, p, n] = await Promise.all([
    user("m"),
    user("c"),
    user("p"),
    user("n"),
  ]);
  const members = await admin.from("workspace_members").insert(
    [m, c, p, n].map((u) => ({
      workspace_id: acme,
      user_id: u.id,
      role: "member" as const,
    })),
  );
  if (members.error) throw new Error(members.error.message);

  [asM, asC, asP, asN, v, b] = await Promise.all([
    asUser(m),
    asUser(c),
    asUser(p),
    asUser(n),
    asUser(fx.users.v),
    asUser(fx.users.b),
  ]);

  const [dataset, dashboard, project] = await Promise.all([
    asM.rpc("create_asset", {
      workspace: acme,
      kind: "dataset",
      name: "Orders",
      qualified_name: qn("fct_orders"),
      description: "One row per order.",
      tags: ["finance"],
      columns: COLUMNS,
    }),
    asM.rpc("create_asset", {
      workspace: acme,
      kind: "dashboard",
      name: "Revenue",
      qualified_name: qn("revenue"),
      properties: { url: "https://looker.example.com/1", tool: "looker" },
    }),
    asM.rpc("create_project", {
      workspace: acme,
      name: "Secret",
      slug: `assets-${fx.runId}`,
      is_private: true,
    }),
  ]);
  for (const r of [dataset, dashboard, project]) {
    if (r.error) throw new Error(r.error.message);
  }
  datasetId = dataset.data!.id;
  dashboardId = dashboard.data!.id;
  projectId = project.data!.id;

  const added = await admin.from("project_members").insert([
    {
      project_id: projectId,
      workspace_id: acme,
      user_id: c.id,
      role: "contributor" as const,
    },
    {
      project_id: projectId,
      workspace_id: acme,
      user_id: p.id,
      role: "viewer" as const,
    },
  ]);
  if (added.error) throw new Error(added.error.message);
});

afterAll(async () => {
  await deleteFixtureUsers(admin, [m.id, c.id, p.id, n.id]);
});

describe("creating assets", () => {
  it("a member creates a dataset with its columns in one call", async () => {
    const [asset] = await expectRows(
      asM
        .from("catalog_assets")
        .select("kind, name, owner_id, column_count, pii_column_count, tags")
        .eq("id", datasetId),
    );
    expect(asset).toEqual({
      kind: "dataset",
      name: "Orders",
      owner_id: m.id,
      column_count: 2,
      pii_column_count: 1,
      tags: ["finance"],
    });
    const [entity] = await expectRows(
      asM.from("entities").select("type, visibility").eq("id", datasetId),
    );
    expect(entity).toEqual({ type: "asset", visibility: "workspace" });
  });

  it("every workspace member reads assets and columns", async () => {
    for (const client of [asN, v]) {
      const rows = await expectRows(
        client.from("dataset_columns").select("name").eq("asset_id", datasetId),
      );
      expect(rows.map((r) => r.name)).toEqual(
        expect.arrayContaining(["order_id", "email"]),
      );
    }
  });

  it("the owner can be handed to another workspace member", async () => {
    const { data, error } = await asN.rpc("create_asset", {
      workspace: acme,
      kind: "ml_model",
      name: "Churn",
      qualified_name: qn("churn"),
      owner: c.id,
    });
    expect(error).toBeNull();
    const [entity] = await expectRows(
      asN.from("entities").select("owner_id").eq("id", data!.id),
    );
    expect(entity!.owner_id).toBe(c.id);
  });

  it("the owner must be a member of the workspace", async () => {
    const { error } = await asN.rpc("create_asset", {
      workspace: acme,
      kind: "ml_model",
      name: "Outsider owned",
      qualified_name: qn("outsider_owned"),
      owner: fx.users.b.id,
    });
    expect(error?.code).toBe(FOREIGN_KEY_VIOLATION);
  });

  it("qualified names are unique per workspace, case-insensitively", async () => {
    const { error } = await asN.rpc("create_asset", {
      workspace: acme,
      kind: "dataset",
      name: "Orders again",
      qualified_name: qn("FCT_ORDERS"),
    });
    expect(error?.code).toBe(UNIQUE_VIOLATION);

    const other = await b.rpc("create_asset", {
      workspace: globex,
      kind: "dataset",
      name: "Same name elsewhere",
      qualified_name: qn("fct_orders"),
    });
    expect(other.error).toBeNull();
    await admin.from("entities").delete().eq("id", other.data!.id);
  });

  it("a qualified name cannot hold URL-breaking characters", async () => {
    const { error } = await asN.rpc("create_asset", {
      workspace: acme,
      kind: "dashboard",
      name: "Bad",
      qualified_name: "looker/bad name",
    });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it("a workspace viewer cannot create an asset", async () => {
    const { error } = await v.rpc("create_asset", {
      workspace: acme,
      kind: "dataset",
      name: "Viewer made",
      qualified_name: qn("viewer_made"),
    });
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it("nobody creates an asset in another workspace", async () => {
    const { error } = await b.rpc("create_asset", {
      workspace: acme,
      kind: "dataset",
      name: "Intruder",
      qualified_name: qn("intruder"),
    });
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it("an asset row cannot be attached to someone else's project entity", async () => {
    const { data: entity } = await admin
      .from("entities")
      .insert({
        workspace_id: globex,
        owner_id: fx.users.b.id,
        type: "asset",
        title: "Globex orphan",
      })
      .select("id")
      .single();
    await expectDenied(
      asN
        .from("assets")
        .insert({
          id: entity!.id,
          workspace_id: globex,
          kind: "dataset",
          qualified_name: qn("orphan"),
        })
        .select(),
    );
    await admin.from("entities").delete().eq("id", entity!.id);
  });
});

describe("editing assets", () => {
  it("any member edits an asset and its columns; column ids survive", async () => {
    const before = await expectRows(
      asN
        .from("dataset_columns")
        .select("id, name")
        .eq("asset_id", datasetId)
        .eq("name", "order_id"),
    );

    const { error } = await asN.rpc("update_asset", {
      asset: datasetId,
      name: "Orders (fact)",
      qualified_name: qn("fct_orders"),
      description: "Updated.",
      owner: m.id,
      tags: ["finance", "core"],
      properties: {},
      columns: [
        {
          name: "ORDER_ID",
          data_type: "bigint",
          description: "",
          is_pii: false,
        },
        {
          name: "amount",
          data_type: "numeric",
          description: "",
          is_pii: false,
        },
      ],
    });
    expect(error).toBeNull();

    const columns = await expectRows(
      asN
        .from("dataset_columns")
        .select("id, name, ordinal, is_pii")
        .eq("asset_id", datasetId)
        .order("ordinal"),
    );
    expect(columns.map((col) => [col.name, col.ordinal])).toEqual([
      ["ORDER_ID", 0],
      ["amount", 1],
    ]);
    expect(columns[0]!.id).toBe(before[0]!.id);

    const [asset] = await expectRows(
      asN
        .from("catalog_assets")
        .select("name, tags, pii_column_count")
        .eq("id", datasetId),
    );
    expect(asset).toEqual({
      name: "Orders (fact)",
      tags: ["finance", "core"],
      pii_column_count: 0,
    });
  });

  it("a viewer cannot edit an asset or its columns", async () => {
    const { error } = await v.rpc("update_asset", {
      asset: datasetId,
      name: "Viewer edit",
      qualified_name: qn("fct_orders"),
      description: "",
      owner: m.id,
      tags: [],
      properties: {},
    });
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const columns = await v.rpc("set_dataset_columns", {
      asset: datasetId,
      columns: [],
    });
    expect(columns.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    await expectDenied(
      v
        .from("dataset_columns")
        .update({ is_pii: true })
        .eq("asset_id", datasetId)
        .select(),
    );
    await expectDenied(
      v.from("dataset_columns").delete().eq("asset_id", datasetId).select(),
    );
  });

  it("only datasets have columns", async () => {
    const { error } = await asM.rpc("set_dataset_columns", {
      asset: dashboardId,
      columns: COLUMNS,
    });
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    const direct = await admin.from("dataset_columns").insert({
      asset_id: dashboardId,
      workspace_id: acme,
      name: "x",
      ordinal: 0,
    });
    expect(direct.error?.code).toBe(FOREIGN_KEY_VIOLATION);
  });

  it("an asset's kind never changes", async () => {
    const { error } = await admin
      .from("assets")
      .update({ kind: "ml_model" })
      .eq("id", dashboardId);
    expect(error?.code).toBe(CHECK_VIOLATION);
  });
});

describe("workspace isolation", () => {
  it("another workspace sees no asset, column or link", async () => {
    await expectDenied(b.from("assets").select("id").eq("id", datasetId));
    await expectDenied(
      b.from("catalog_assets").select("id").eq("id", datasetId),
    );
    await expectDenied(
      b.from("dataset_columns").select("id").eq("asset_id", datasetId),
    );
    await expectDenied(
      b.from("project_assets").select("asset_id").eq("asset_id", datasetId),
    );
  });

  it("another workspace cannot edit or delete an asset", async () => {
    const { error } = await b.rpc("update_asset", {
      asset: datasetId,
      name: "Hijacked",
      qualified_name: qn("fct_orders"),
      description: "",
      owner: fx.users.b.id,
      tags: [],
      properties: {},
    });
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    await expectDenied(
      b.from("entities").delete().eq("id", datasetId).select(),
    );
  });

  it("the anonymous role reads nothing", async () => {
    const anon = asAnon();
    const results = await Promise.all([
      anon.from("assets").select("id").limit(1),
      anon.from("dataset_columns").select("id").limit(1),
      anon.from("project_assets").select("asset_id").limit(1),
      anon.from("catalog_assets").select("id").limit(1),
    ]);
    for (const { data, error } of results) {
      expect(error !== null || data?.length === 0).toBe(true);
    }
  });
});

describe("project links", () => {
  it("a project contributor links an asset; the lead unlinks it", async () => {
    await expectRows(
      asC
        .from("project_assets")
        .insert({
          project_id: projectId,
          asset_id: datasetId,
          workspace_id: acme,
        })
        .select(),
    );
    const [asset] = await expectRows(
      asC.from("catalog_assets").select("project_ids").eq("id", datasetId),
    );
    expect(asset!.project_ids).toEqual([projectId]);

    await expectRows(
      asM
        .from("project_assets")
        .delete()
        .eq("project_id", projectId)
        .eq("asset_id", datasetId)
        .select(),
    );
  });

  it("a project viewer and a non-member cannot link", async () => {
    for (const client of [asP, asN, v]) {
      await expectDenied(
        client
          .from("project_assets")
          .insert({
            project_id: projectId,
            asset_id: dashboardId,
            workspace_id: acme,
          })
          .select(),
      );
    }
  });

  it("a link to a private project is hidden from non-members", async () => {
    await expectRows(
      asM
        .from("project_assets")
        .insert({
          project_id: projectId,
          asset_id: dashboardId,
          workspace_id: acme,
        })
        .select(),
    );
    await expectDenied(
      asN.from("project_assets").select("asset_id").eq("project_id", projectId),
    );
    const [asset] = await expectRows(
      asN.from("catalog_assets").select("project_ids").eq("id", dashboardId),
    );
    expect(asset!.project_ids).toEqual([]);

    // The project viewer sees it but cannot unlink it.
    await expectRows(
      asP.from("project_assets").select("asset_id").eq("project_id", projectId),
    );
    await expectDenied(
      asP
        .from("project_assets")
        .delete()
        .eq("project_id", projectId)
        .eq("asset_id", dashboardId)
        .select(),
    );
  });

  it("a link cannot cross workspaces", async () => {
    const other = await b.rpc("create_asset", {
      workspace: globex,
      kind: "dataset",
      name: "Globex orders",
      qualified_name: qn("globex_orders"),
    });
    const { error } = await admin.from("project_assets").insert({
      project_id: projectId,
      asset_id: other.data!.id,
      workspace_id: acme,
    });
    expect(error?.code).toBe(FOREIGN_KEY_VIOLATION);
    await admin.from("entities").delete().eq("id", other.data!.id);
  });
});

describe("deleting assets", () => {
  it("a member who does not own it cannot delete; the owner can", async () => {
    const { data } = await asM.rpc("create_asset", {
      workspace: acme,
      kind: "source_system",
      name: "Shop app",
      qualified_name: qn("shop_app"),
    });
    await expectDenied(
      asN.from("entities").delete().eq("id", data!.id).select(),
    );
    await expectRows(asM.from("entities").delete().eq("id", data!.id).select());
    await expectDenied(asM.from("assets").select("id").eq("id", data!.id));
  });
});
