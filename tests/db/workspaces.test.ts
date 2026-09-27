import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { createInviteToken } from "@/lib/workspace/invite-token";

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
const { acme } = fx.workspaces;
const admin = createAdminClient();

// Extra acme members for this file: D (admin), M (member), plus I, a user
// with no workspace who receives token invites.
let d: FixtureUser;
let m: FixtureUser;
let i: FixtureUser;

let a: TypedClient;
let b: TypedClient;
let v: TypedClient;
let asD: TypedClient;
let asM: TypedClient;
let asI: TypedClient;

// check_violation: the last-owner trigger and table checks.
const CHECK_VIOLATION = "23514";

beforeAll(async () => {
  [d, m, i] = await Promise.all([
    createFixtureUser(admin, "d", fx.runId),
    createFixtureUser(admin, "m", fx.runId),
    createFixtureUser(admin, "i", fx.runId),
  ]);

  const { error } = await admin.from("workspace_members").insert([
    { workspace_id: acme, user_id: d.id, role: "admin" },
    { workspace_id: acme, user_id: m.id, role: "member" },
  ]);
  if (error) throw new Error(error.message);

  [a, b, v, asD, asM, asI] = await Promise.all([
    asUser(fx.users.a),
    asUser(fx.users.b),
    asUser(fx.users.v),
    asUser(d),
    asUser(m),
    asUser(i),
  ]);
});

afterAll(async () => {
  await admin.from("invites").delete().eq("workspace_id", acme);
  // Put A back as the only owner if a guard test failed midway.
  await admin
    .from("workspace_members")
    .update({ role: "owner" })
    .eq("workspace_id", acme)
    .eq("user_id", fx.users.a.id);
  await admin
    .from("workspace_members")
    .update({ role: "admin" })
    .eq("workspace_id", acme)
    .eq("user_id", d.id);
  await deleteFixtureUsers(admin, [d.id, m.id, i.id]);
});

async function addInvite(
  email: string,
  opts: { role?: "admin" | "member" | "viewer"; expired?: boolean } = {},
) {
  const { token, hash } = createInviteToken();
  const { error } = await admin.from("invites").insert({
    workspace_id: acme,
    email,
    role: opts.role ?? "member",
    token_hash: hash,
    invited_by: fx.users.a.id,
    ...(opts.expired
      ? { expires_at: new Date(Date.now() - 60_000).toISOString() }
      : {}),
  });
  if (error) throw new Error(error.message);
  return token;
}

describe("members list", () => {
  it("members of a workspace see each other", async () => {
    const rows = await expectRows(
      asM
        .from("workspace_members")
        .select("user_id, profiles(display_name)")
        .eq("workspace_id", acme),
    );
    expect(rows.map((r) => r.user_id)).toEqual(
      expect.arrayContaining([fx.users.a.id, fx.users.v.id, d.id, m.id]),
    );
    expect(rows.every((r) => r.profiles !== null)).toBe(true);
  });

  it("a user in another workspace sees nothing", async () => {
    await expectDenied(
      b.from("workspace_members").select("user_id").eq("workspace_id", acme),
    );
    await expectDenied(b.from("profiles").select("id").in("id", [d.id, m.id]));
  });
});

describe("invites by role", () => {
  const email = (who: string) => `${who}+rls-${fx.runId}@tessera.test`;

  it("an admin can invite and read invites", async () => {
    const [row] = await expectRows(
      asD
        .from("invites")
        .insert({
          workspace_id: acme,
          email: email("byadmin"),
          role: "member",
          token_hash: createInviteToken().hash,
          invited_by: d.id,
        })
        .select("id, expires_at"),
    );
    expect(row).toBeDefined();
    const days = (Date.parse(row!.expires_at) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    const listed = await expectRows(
      asD.from("invites").select("id").eq("id", row!.id),
    );
    expect(listed).toHaveLength(1);
  });

  it("an admin cannot invite an owner", async () => {
    await expectDenied(
      asD
        .from("invites")
        .insert({
          workspace_id: acme,
          email: email("owner"),
          role: "owner",
          token_hash: createInviteToken().hash,
          invited_by: d.id,
        })
        .select(),
    );
  });

  it("a member cannot invite or read invites", async () => {
    await expectDenied(
      asM
        .from("invites")
        .insert({
          workspace_id: acme,
          email: email("bymember"),
          token_hash: createInviteToken().hash,
          invited_by: m.id,
        })
        .select(),
    );
    await expectDenied(
      asM.from("invites").select("id").eq("workspace_id", acme),
    );
  });

  it("a viewer cannot read or revoke invites", async () => {
    await addInvite(email("revoke"));
    await expectDenied(v.from("invites").select("id").eq("workspace_id", acme));
    await expectDenied(
      v.from("invites").delete().eq("workspace_id", acme).select(),
    );
  });

  it("an admin can revoke an invite", async () => {
    await addInvite(email("revoked"));
    const rows = await expectRows(
      asD
        .from("invites")
        .delete()
        .eq("workspace_id", acme)
        .eq("email", email("revoked"))
        .select("id"),
    );
    expect(rows).toHaveLength(1);
  });
});

describe("roles", () => {
  it("an admin changes a member's role", async () => {
    const demoted = await expectRows(
      asD
        .from("workspace_members")
        .update({ role: "viewer" })
        .eq("workspace_id", acme)
        .eq("user_id", m.id)
        .select("role"),
    );
    expect(demoted).toEqual([{ role: "viewer" }]);
    const restored = await expectRows(
      asD
        .from("workspace_members")
        .update({ role: "member" })
        .eq("workspace_id", acme)
        .eq("user_id", m.id)
        .select("role"),
    );
    expect(restored).toEqual([{ role: "member" }]);
  });

  it("an admin cannot promote to owner or touch an owner", async () => {
    await expectDenied(
      asD
        .from("workspace_members")
        .update({ role: "owner" })
        .eq("workspace_id", acme)
        .eq("user_id", m.id)
        .select(),
    );
    await expectDenied(
      asD
        .from("workspace_members")
        .update({ role: "viewer" })
        .eq("workspace_id", acme)
        .eq("user_id", fx.users.a.id)
        .select(),
    );
    await expectDenied(
      asD
        .from("workspace_members")
        .delete()
        .eq("workspace_id", acme)
        .eq("user_id", fx.users.a.id)
        .select(),
    );
  });

  it("members and viewers cannot change roles or remove anyone", async () => {
    for (const client of [asM, v]) {
      await expectDenied(
        client
          .from("workspace_members")
          .update({ role: "admin" })
          .eq("workspace_id", acme)
          .eq("user_id", m.id)
          .select(),
      );
      await expectDenied(
        client
          .from("workspace_members")
          .delete()
          .eq("workspace_id", acme)
          .eq("user_id", d.id)
          .select(),
      );
    }
  });

  it("a membership cannot move to another user or workspace", async () => {
    const { error } = await a
      .from("workspace_members")
      .update({ user_id: fx.users.b.id })
      .eq("workspace_id", acme)
      .eq("user_id", m.id)
      .select();
    expect(error?.code).toBe("42501");
  });
});

describe("last-owner guard", () => {
  it("the only owner cannot demote themselves", async () => {
    const { error } = await a
      .from("workspace_members")
      .update({ role: "admin" })
      .eq("workspace_id", acme)
      .eq("user_id", fx.users.a.id)
      .select();
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it("the only owner cannot leave", async () => {
    const { error } = await a
      .from("workspace_members")
      .delete()
      .eq("workspace_id", acme)
      .eq("user_id", fx.users.a.id)
      .select();
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it("an owner can step down once there is another owner", async () => {
    await expectRows(
      a
        .from("workspace_members")
        .update({ role: "owner" })
        .eq("workspace_id", acme)
        .eq("user_id", d.id)
        .select("role"),
    );
    const steppedDown = await expectRows(
      a
        .from("workspace_members")
        .update({ role: "admin" })
        .eq("workspace_id", acme)
        .eq("user_id", fx.users.a.id)
        .select("role"),
    );
    expect(steppedDown).toEqual([{ role: "admin" }]);

    // D is now the only owner, and the guard applies to them.
    const { error } = await asD
      .from("workspace_members")
      .delete()
      .eq("workspace_id", acme)
      .eq("user_id", d.id)
      .select();
    expect(error?.code).toBe(CHECK_VIOLATION);

    // Restore: A owner again, then D back to admin.
    await expectRows(
      asD
        .from("workspace_members")
        .update({ role: "owner" })
        .eq("workspace_id", acme)
        .eq("user_id", fx.users.a.id)
        .select("role"),
    );
    await expectRows(
      a
        .from("workspace_members")
        .update({ role: "admin" })
        .eq("workspace_id", acme)
        .eq("user_id", d.id)
        .select("role"),
    );
  });

  it("deleting the workspace still removes its last owner", async () => {
    const { data: scratch, error } = await b.rpc("create_workspace", {
      name: "Guard scratch",
      slug: `guard-${fx.runId}`,
    });
    expect(error).toBeNull();
    const deleted = await expectRows(
      b.from("workspaces").delete().eq("id", scratch!.id).select("id"),
    );
    expect(deleted).toHaveLength(1);
    const { count } = await admin
      .from("workspace_members")
      .select("user_id", { count: "exact", head: true })
      .eq("workspace_id", scratch!.id);
    expect(count).toBe(0);
  });

  it("the reserved slug `new` is rejected", async () => {
    const { error } = await b.rpc("create_workspace", {
      name: "New",
      slug: "new",
    });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });
});

describe("token invites", () => {
  it("the invitee previews and accepts; the invite then reads as used", async () => {
    const token = await addInvite(i.email.toUpperCase(), { role: "viewer" });

    const { data: preview, error } = await asI.rpc("invite_preview", {
      token,
    });
    expect(error).toBeNull();
    expect(preview).toEqual([
      expect.objectContaining({
        workspace_id: acme,
        role: "viewer",
        status: "pending",
        email_matches: true,
        is_member: false,
      }),
    ]);

    const accepted = await asI.rpc("accept_invite", { token });
    expect(accepted).toMatchObject({ data: acme, error: null });

    const rows = await expectRows(
      asI
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", acme)
        .eq("user_id", i.id),
    );
    expect(rows).toEqual([{ role: "viewer" }]);

    const after = await asI.rpc("invite_preview", { token });
    expect(after.data?.[0]).toMatchObject({
      status: "accepted",
      is_member: true,
    });

    const again = await asI.rpc("accept_invite", { token });
    expect(again.error).not.toBeNull();
  });

  it("a user with another email cannot accept", async () => {
    const token = await addInvite(`other+rls-${fx.runId}@tessera.test`);
    const { data } = await asM.rpc("invite_preview", { token });
    expect(data?.[0]?.email_matches).toBe(false);

    const { error } = await asM.rpc("accept_invite", { token });
    expect(error).not.toBeNull();
  });

  it("expired and unknown tokens are rejected", async () => {
    const expired = await addInvite(`late+rls-${fx.runId}@tessera.test`, {
      expired: true,
    });
    const { data } = await asM.rpc("invite_preview", { token: expired });
    expect(data?.[0]?.status).toBe("expired");

    const unknown = createInviteToken().token;
    const preview = await asM.rpc("invite_preview", { token: unknown });
    expect(preview.data).toEqual([]);
    const { error } = await asM.rpc("accept_invite", { token: unknown });
    expect(error).not.toBeNull();
  });

  it("anonymous callers cannot use the invite RPCs", async () => {
    const token = await addInvite(`anon+rls-${fx.runId}@tessera.test`);
    const anon = asAnon();
    const preview = await anon.rpc("invite_preview", { token });
    expect(preview.error).not.toBeNull();
    const accept = await anon.rpc("accept_invite", { token });
    expect(accept.error).not.toBeNull();
  });
});
