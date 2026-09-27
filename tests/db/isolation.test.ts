import { beforeAll, describe, expect, inject, it } from "vitest";

import {
  asAnon,
  asUser,
  expectDenied,
  expectRows,
  type TypedClient,
} from "./helpers";

const fx = inject("fixtures");
const { acme, globex } = fx.workspaces;

let a: TypedClient;
let b: TypedClient;

beforeAll(async () => {
  [a, b] = await Promise.all([asUser(fx.users.a), asUser(fx.users.b)]);
});

describe("cross-workspace isolation (B is not in acme)", () => {
  it("B cannot read the acme workspace", async () => {
    await expectDenied(b.from("workspaces").select("id").eq("id", acme));
  });

  it("B cannot read acme entities", async () => {
    await expectDenied(
      b.from("entities").select("id").eq("workspace_id", acme),
    );
  });

  it("B cannot read acme members", async () => {
    await expectDenied(
      b.from("workspace_members").select("user_id").eq("workspace_id", acme),
    );
  });

  it("B cannot read the profile of a user it shares no workspace with", async () => {
    await expectDenied(b.from("profiles").select("id").eq("id", fx.users.a.id));
  });

  it("B cannot create an entity in acme", async () => {
    await expectDenied(
      b
        .from("entities")
        .insert({
          workspace_id: acme,
          owner_id: fx.users.b.id,
          type: "asset",
          title: "intruder",
        })
        .select(),
    );
  });

  it("B cannot update or delete an acme entity", async () => {
    await expectDenied(
      b
        .from("entities")
        .update({ title: "hijacked" })
        .eq("id", fx.entities.acmeShared)
        .select(),
    );
    await expectDenied(
      b.from("entities").delete().eq("id", fx.entities.acmeShared).select(),
    );
  });

  it("B cannot add itself to acme", async () => {
    await expectDenied(
      b
        .from("workspace_members")
        .insert({ workspace_id: acme, user_id: fx.users.b.id, role: "owner" })
        .select(),
    );
  });

  it("B cannot rename or delete acme", async () => {
    await expectDenied(
      b.from("workspaces").update({ name: "pwned" }).eq("id", acme).select(),
    );
    await expectDenied(b.from("workspaces").delete().eq("id", acme).select());
  });

  it("each owner lists only its own workspace and entities", async () => {
    const fixtureWorkspaces = [acme, globex];
    const aWorkspaces = await expectRows(
      a.from("workspaces").select("id").in("id", fixtureWorkspaces),
    );
    expect(aWorkspaces.map((w) => w.id)).toEqual([acme]);

    const bEntities = await expectRows(
      b.from("entities").select("id").in("workspace_id", fixtureWorkspaces),
    );
    expect(bEntities.map((e) => e.id)).toEqual([fx.entities.globexShared]);
  });
});

describe("anonymous access", () => {
  const anon = asAnon();

  it.each([
    "profiles",
    "workspaces",
    "workspace_members",
    "invites",
    "entities",
  ] as const)("anon cannot read %s", async (table) => {
    await expectDenied(anon.from(table).select());
  });

  it("anon cannot create a workspace", async () => {
    await expectDenied(
      anon.rpc("create_workspace", { name: "anon", slug: `anon-${fx.runId}` }),
    );
  });
});
