import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import {
  asUser,
  createAdminClient,
  expectDenied,
  expectRows,
  type TypedClient,
} from "./helpers";

const fx = inject("fixtures");
const { acme } = fx.workspaces;
const { acmeShared, acmePrivate } = fx.entities;

let a: TypedClient;
let b: TypedClient;
let v: TypedClient;

beforeAll(async () => {
  [a, b, v] = await Promise.all([
    asUser(fx.users.a),
    asUser(fx.users.b),
    asUser(fx.users.v),
  ]);
});

describe("members can read their workspace", () => {
  it("A (owner) reads the workspace and both of its entities", async () => {
    await expectRows(a.from("workspaces").select("id").eq("id", acme)).then(
      (rows) => expect(rows).toHaveLength(1),
    );
    const entities = await expectRows(
      a.from("entities").select("id").eq("workspace_id", acme),
    );
    expect(entities.map((e) => e.id).sort()).toEqual(
      [acmeShared, acmePrivate].sort(),
    );
  });

  it("V (viewer) reads the workspace, its members and shared entities", async () => {
    await expectRows(v.from("workspaces").select("id").eq("id", acme)).then(
      (rows) => expect(rows).toHaveLength(1),
    );
    const members = await expectRows(
      v
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", acme),
    );
    expect(members).toEqual(
      expect.arrayContaining([
        { user_id: fx.users.a.id, role: "owner" },
        { user_id: fx.users.v.id, role: "viewer" },
      ]),
    );
    const entities = await expectRows(
      v.from("entities").select("id").eq("id", acmeShared),
    );
    expect(entities).toHaveLength(1);
  });

  it("workspace peers can read each other's profiles", async () => {
    const rows = await expectRows(
      v.from("profiles").select("id").in("id", [fx.users.a.id, fx.users.v.id]),
    );
    expect(rows).toHaveLength(2);
  });
});

describe("viewer is read-only", () => {
  it("V cannot create an entity", async () => {
    await expectDenied(
      v
        .from("entities")
        .insert({
          workspace_id: acme,
          owner_id: fx.users.v.id,
          type: "asset",
          title: "viewer write",
        })
        .select(),
    );
  });

  it("V cannot update or delete an entity it can read", async () => {
    await expectDenied(
      v
        .from("entities")
        .update({ title: "viewer edit" })
        .eq("id", acmeShared)
        .select(),
    );
    await expectDenied(
      v.from("entities").delete().eq("id", acmeShared).select(),
    );

    const admin = createAdminClient();
    const { data } = await admin
      .from("entities")
      .select("title")
      .eq("id", acmeShared)
      .single();
    expect(data?.title).toBe("RLS workspace entity");
  });

  it("V cannot rename the workspace", async () => {
    await expectDenied(
      v.from("workspaces").update({ name: "viewer" }).eq("id", acme).select(),
    );
  });

  it("V cannot invite or promote members", async () => {
    await expectDenied(
      v
        .from("invites")
        .insert({
          workspace_id: acme,
          email: `x+rls-${fx.runId}@tessera.test`,
          token_hash: `rls-${fx.runId}`,
        })
        .select(),
    );
    await expectDenied(
      v
        .from("workspace_members")
        .update({ role: "owner" })
        .eq("workspace_id", acme)
        .eq("user_id", fx.users.v.id)
        .select(),
    );
  });
});

describe("private entities", () => {
  it("are hidden from other members of the workspace", async () => {
    await expectDenied(v.from("entities").select("id").eq("id", acmePrivate));
    await expectDenied(
      v
        .from("entities")
        .update({ title: "peek" })
        .eq("id", acmePrivate)
        .select(),
    );
  });

  it("are readable by their owner", async () => {
    const rows = await expectRows(
      a.from("entities").select("id, visibility").eq("id", acmePrivate),
    );
    expect(rows).toEqual([{ id: acmePrivate, visibility: "private" }]);
  });
});

describe("writers can write", () => {
  const created: string[] = [];

  afterAll(async () => {
    // Undo any leftovers if an assertion failed midway.
    const admin = createAdminClient();
    await admin
      .from("workspaces")
      .update({ name: `acme-${fx.runId}` })
      .eq("id", acme);
    if (created.length)
      await admin.from("workspaces").delete().in("id", created);
  });

  it("A creates, updates and deletes an entity", async () => {
    const [entity] = await expectRows(
      a
        .from("entities")
        .insert({ workspace_id: acme, type: "page", title: "draft" })
        .select("id, owner_id"),
    );
    expect(entity?.owner_id).toBe(fx.users.a.id);

    const updated = await expectRows(
      a
        .from("entities")
        .update({ title: "final" })
        .eq("id", entity!.id)
        .select("title"),
    );
    expect(updated).toEqual([{ title: "final" }]);

    const deleted = await expectRows(
      a.from("entities").delete().eq("id", entity!.id).select("id"),
    );
    expect(deleted).toHaveLength(1);
  });

  it("A (owner) renames the workspace", async () => {
    const rows = await expectRows(
      a
        .from("workspaces")
        .update({ name: "Acme renamed" })
        .eq("id", acme)
        .select("name"),
    );
    expect(rows).toEqual([{ name: "Acme renamed" }]);
  });

  it("users update their own profile but not someone else's", async () => {
    const own = await expectRows(
      a
        .from("profiles")
        .update({ bio: "hello" })
        .eq("id", fx.users.a.id)
        .select("bio"),
    );
    expect(own).toEqual([{ bio: "hello" }]);
    await expectDenied(
      v
        .from("profiles")
        .update({ bio: "not yours" })
        .eq("id", fx.users.a.id)
        .select(),
    );
  });

  it("any user creates a workspace via RPC and becomes its owner, who can delete it", async () => {
    const { data: workspace, error } = await b.rpc("create_workspace", {
      name: "Scratch",
      slug: `scratch-${fx.runId}`,
    });
    expect(error).toBeNull();
    created.push(workspace!.id);

    const members = await expectRows(
      b
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", workspace!.id),
    );
    expect(members).toEqual([{ user_id: fx.users.b.id, role: "owner" }]);

    const deleted = await expectRows(
      b.from("workspaces").delete().eq("id", workspace!.id).select("id"),
    );
    expect(deleted).toHaveLength(1);
  });
});
