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
// | User | Workspace role | Project role (private + shared) |
// | ---- | -------------- | ------------------------------- |
// | L    | member         | lead (creator)                  |
// | C    | member         | contributor                     |
// | P    | member         | viewer                          |
// | O    | member         | — (outsider)                    |
// | D    | admin          | —                               |
let l: FixtureUser;
let c: FixtureUser;
let p: FixtureUser;
let o: FixtureUser;
let d: FixtureUser;

let asL: TypedClient;
let asC: TypedClient;
let asP: TypedClient;
let asO: TypedClient;
let asD: TypedClient;
let v: TypedClient;
let b: TypedClient;

let privateId: string;
let sharedId: string;

const INSUFFICIENT_PRIVILEGE = "42501";
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

const slug = (name: string) => `${name}-${fx.runId}`;

async function createProject(
  client: TypedClient,
  name: string,
  opts: { isPrivate?: boolean; workspace?: string } = {},
) {
  return client.rpc("create_project", {
    workspace: opts.workspace ?? acme,
    name,
    slug: slug(name.toLowerCase()),
    description: `${name} description`,
    is_private: opts.isPrivate ?? false,
  });
}

beforeAll(async () => {
  const user = (name: string) =>
    createFixtureUser(admin, `proj${name}`, fx.runId);
  [l, c, p, o, d] = await Promise.all([
    user("l"),
    user("c"),
    user("p"),
    user("o"),
    user("d"),
  ]);
  const members = await admin.from("workspace_members").insert([
    { workspace_id: acme, user_id: l.id, role: "member" },
    { workspace_id: acme, user_id: c.id, role: "member" },
    { workspace_id: acme, user_id: p.id, role: "member" },
    { workspace_id: acme, user_id: o.id, role: "member" },
    { workspace_id: acme, user_id: d.id, role: "admin" },
  ]);
  if (members.error) throw new Error(members.error.message);

  [asL, asC, asP, asO, asD, v, b] = await Promise.all([
    asUser(l),
    asUser(c),
    asUser(p),
    asUser(o),
    asUser(d),
    asUser(fx.users.v),
    asUser(fx.users.b),
  ]);

  const [priv, shared] = await Promise.all([
    createProject(asL, "Secret", { isPrivate: true }),
    createProject(asL, "Shared"),
  ]);
  if (priv.error || shared.error) {
    throw new Error((priv.error ?? shared.error)!.message);
  }
  privateId = priv.data.id;
  sharedId = shared.data.id;

  const added = await admin.from("project_members").insert(
    [privateId, sharedId].flatMap((project_id) => [
      {
        project_id,
        workspace_id: acme,
        user_id: c.id,
        role: "contributor" as const,
      },
      {
        project_id,
        workspace_id: acme,
        user_id: p.id,
        role: "viewer" as const,
      },
    ]),
  );
  if (added.error) throw new Error(added.error.message);
});

afterAll(async () => {
  await deleteFixtureUsers(admin, [l.id, c.id, p.id, o.id, d.id]);
});

describe("creating projects", () => {
  it("a workspace member creates a project and becomes its lead", async () => {
    const [row] = await expectRows(
      asL
        .from("project_members")
        .select("user_id, role")
        .eq("project_id", sharedId)
        .eq("user_id", l.id),
    );
    expect(row).toEqual({ user_id: l.id, role: "lead" });

    const [project] = await expectRows(
      asL
        .from("projects")
        .select("slug, status, archived_at, entities(title, visibility)")
        .eq("id", sharedId),
    );
    expect(project).toMatchObject({
      slug: slug("shared"),
      status: "planning",
      archived_at: null,
      entities: { title: "Shared", visibility: "workspace" },
    });
  });

  it("a private project is scoped to itself", async () => {
    const [entity] = await expectRows(
      asL.from("entities").select("visibility, project_id").eq("id", privateId),
    );
    expect(entity).toEqual({ visibility: "project", project_id: privateId });
  });

  it("a workspace viewer cannot create a project", async () => {
    const { error } = await createProject(v, "Viewer Made");
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it("nobody creates a project in another workspace", async () => {
    const { error } = await createProject(b, "Intruder");
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it("a slug is unique per workspace", async () => {
    const { error } = await asO.rpc("create_project", {
      workspace: acme,
      name: "Duplicate",
      slug: slug("shared"),
    });
    expect(error?.code).toBe(UNIQUE_VIOLATION);

    const other = await b.rpc("create_project", {
      workspace: globex,
      name: "Same slug elsewhere",
      slug: slug("shared"),
    });
    expect(other.error).toBeNull();
    // Keep the shared globex fixtures as other files expect them.
    await admin.from("entities").delete().eq("id", other.data!.id);
  });

  it("a project row cannot be attached to someone else's entity", async () => {
    const { data: entity } = await admin
      .from("entities")
      .insert({
        workspace_id: acme,
        owner_id: l.id,
        type: "project",
        title: "Orphan",
      })
      .select("id")
      .single();
    await expectDenied(
      asO
        .from("projects")
        .insert({ id: entity!.id, workspace_id: acme, slug: slug("orphan") })
        .select(),
    );
  });
});

describe("visibility", () => {
  it("a private project is invisible to a workspace member outside it", async () => {
    await expectDenied(asO.from("projects").select("id").eq("id", privateId));
    await expectDenied(asO.from("entities").select("id").eq("id", privateId));
    await expectDenied(
      asO.from("project_members").select("user_id").eq("project_id", privateId),
    );
  });

  it("project members and workspace admins see a private project", async () => {
    for (const client of [asL, asC, asP, asD]) {
      const rows = await expectRows(
        client.from("projects").select("id").eq("id", privateId),
      );
      expect(rows).toHaveLength(1);
    }
    const members = await expectRows(
      asP.from("project_members").select("user_id").eq("project_id", privateId),
    );
    expect(members.map((m) => m.user_id)).toEqual(
      expect.arrayContaining([l.id, c.id, p.id]),
    );
  });

  it("a workspace project is visible to every workspace member", async () => {
    for (const client of [asO, v]) {
      const rows = await expectRows(
        client.from("projects").select("id").eq("id", sharedId),
      );
      expect(rows).toHaveLength(1);
    }
  });

  it("another workspace and anonymous users see nothing", async () => {
    for (const client of [b, asAnon()]) {
      await expectDenied(
        client.from("projects").select("id").in("id", [privateId, sharedId]),
      );
      await expectDenied(
        client
          .from("project_members")
          .select("user_id")
          .in("project_id", [privateId, sharedId]),
      );
    }
  });
});

describe("editing", () => {
  const edit = (client: TypedClient, name: string, isPrivate = true) =>
    client.rpc("update_project", {
      project: privateId,
      name,
      slug: slug("secret"),
      description: "Edited",
      status: "active",
      is_private: isPrivate,
    });

  it("a contributor can edit", async () => {
    const { data, error } = await edit(asC, "Secret (edited)");
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "active", description: "Edited" });
    const [entity] = await expectRows(
      asC.from("entities").select("title").eq("id", privateId),
    );
    expect(entity?.title).toBe("Secret (edited)");
  });

  it("a project viewer cannot edit", async () => {
    const { error } = await edit(asP, "Viewer edit");
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    await expectDenied(
      asP
        .from("projects")
        .update({ status: "done" })
        .eq("id", privateId)
        .select(),
    );
    await expectDenied(
      asP
        .from("entities")
        .update({ title: "Viewer edit" })
        .eq("id", privateId)
        .select(),
    );
  });

  it("a workspace member outside a workspace project cannot edit it", async () => {
    await expectDenied(
      asO
        .from("projects")
        .update({ status: "done" })
        .eq("id", sharedId)
        .select(),
    );
  });

  it("a workspace viewer who is a project lead cannot edit", async () => {
    await admin.from("project_members").insert({
      project_id: sharedId,
      workspace_id: acme,
      user_id: fx.users.v.id,
      role: "lead",
    });
    try {
      await expectDenied(
        v
          .from("projects")
          .update({ status: "done" })
          .eq("id", sharedId)
          .select(),
      );
    } finally {
      await admin
        .from("project_members")
        .delete()
        .eq("project_id", sharedId)
        .eq("user_id", fx.users.v.id);
    }
  });

  it("only a lead changes visibility or archives", async () => {
    const visibility = await edit(asC, "Secret (edited)", false);
    expect(visibility.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const archive = await asC
      .from("projects")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", privateId)
      .select();
    expect(archive.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const archived = await expectRows(
      asL
        .from("projects")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", privateId)
        .select("archived_at"),
    );
    expect(archived[0]?.archived_at).not.toBeNull();
    const restored = await expectRows(
      asD
        .from("projects")
        .update({ archived_at: null })
        .eq("id", privateId)
        .select("archived_at"),
    );
    expect(restored).toEqual([{ archived_at: null }]);
  });

  it("a lead makes a private project workspace-visible and back", async () => {
    const opened = await edit(asL, "Secret", false);
    expect(opened.error).toBeNull();
    expect(
      await expectRows(asO.from("projects").select("id").eq("id", privateId)),
    ).toHaveLength(1);

    const closed = await edit(asL, "Secret", true);
    expect(closed.error).toBeNull();
    await expectDenied(asO.from("projects").select("id").eq("id", privateId));
  });

  it("a project's workspace and slug format are enforced", async () => {
    const { error } = await asL
      .from("projects")
      .update({ slug: "Not A Slug" })
      .eq("id", sharedId)
      .select();
    expect(error?.code).toBe("23514");
  });
});

describe("members", () => {
  it("a lead adds a workspace member, changes their role and removes them", async () => {
    const [added] = await expectRows(
      asL
        .from("project_members")
        .insert({
          project_id: sharedId,
          workspace_id: acme,
          user_id: o.id,
          role: "viewer",
        })
        .select("role"),
    );
    expect(added?.role).toBe("viewer");

    const changed = await expectRows(
      asL
        .from("project_members")
        .update({ role: "contributor" })
        .eq("project_id", sharedId)
        .eq("user_id", o.id)
        .select("role"),
    );
    expect(changed).toEqual([{ role: "contributor" }]);

    const removed = await expectRows(
      asL
        .from("project_members")
        .delete()
        .eq("project_id", sharedId)
        .eq("user_id", o.id)
        .select("user_id"),
    );
    expect(removed).toHaveLength(1);
  });

  it("a contributor cannot manage members", async () => {
    await expectDenied(
      asC
        .from("project_members")
        .insert({
          project_id: sharedId,
          workspace_id: acme,
          user_id: o.id,
          role: "lead",
        })
        .select(),
    );
    await expectDenied(
      asC
        .from("project_members")
        .update({ role: "lead" })
        .eq("project_id", sharedId)
        .eq("user_id", p.id)
        .select(),
    );
    await expectDenied(
      asC
        .from("project_members")
        .delete()
        .eq("project_id", sharedId)
        .eq("user_id", p.id)
        .select(),
    );
  });

  it("only workspace members can join a project", async () => {
    const { error } = await asL.from("project_members").insert({
      project_id: sharedId,
      workspace_id: acme,
      user_id: fx.users.b.id,
      role: "viewer",
    });
    expect(error?.code).toBe(FOREIGN_KEY_VIOLATION);
  });

  it("a member can leave; leaving the workspace removes them", async () => {
    const left = await expectRows(
      asP
        .from("project_members")
        .delete()
        .eq("project_id", sharedId)
        .eq("user_id", p.id)
        .select("user_id"),
    );
    expect(left).toHaveLength(1);

    await admin
      .from("workspace_members")
      .delete()
      .eq("workspace_id", acme)
      .eq("user_id", p.id);
    const { data } = await admin
      .from("project_members")
      .select("project_id")
      .eq("user_id", p.id);
    expect(data).toEqual([]);
  });
});
