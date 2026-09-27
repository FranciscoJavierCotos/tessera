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
const { acme } = fx.workspaces;
const admin = createAdminClient();

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

let a: TypedClient;
let b: TypedClient;
let v: TypedClient;
/** A fresh user who has not onboarded and belongs to no workspace. */
let n: TypedClient;
let newUser: FixtureUser;

const handleA = `a_${fx.runId}`;
const avatarA = `${fx.users.a.id}/avatar-${fx.runId}.png`;

beforeAll(async () => {
  newUser = await createFixtureUser(admin, "n", fx.runId);
  [a, b, v, n] = await Promise.all([
    asUser(fx.users.a),
    asUser(fx.users.b),
    asUser(fx.users.v),
    asUser(newUser),
  ]);
});

afterAll(async () => {
  await admin.storage
    .from("avatars")
    .remove([avatarA, `${fx.users.v.id}/intruder-${fx.runId}.png`]);
  await admin.from("invites").delete().like("token_hash", `f06-${fx.runId}-%`);
  await deleteFixtureUsers(admin, [newUser.id]);
});

describe("handles", () => {
  it("a user claims a free handle", async () => {
    const rows = await expectRows(
      a
        .from("profiles")
        .update({ handle: handleA })
        .eq("id", fx.users.a.id)
        .select("handle"),
    );
    expect(rows).toEqual([{ handle: handleA }]);
  });

  it("uniqueness is enforced by the DB", async () => {
    const { error } = await v
      .from("profiles")
      .update({ handle: handleA })
      .eq("id", fx.users.v.id)
      .select();
    expect(error?.code).toBe("23505");
  });

  it("the handle format is enforced by the DB", async () => {
    const { error } = await v
      .from("profiles")
      .update({ handle: "Not-A-Handle" })
      .eq("id", fx.users.v.id)
      .select();
    expect(error?.code).toBe("23514");
  });

  it("is_handle_available sees handles the caller cannot read", async () => {
    // B shares no workspace with A, so A's profile is invisible to B…
    await expectDenied(b.from("profiles").select("id").eq("handle", handleA));
    // …but the handle still reads as taken.
    const taken = await b.rpc("is_handle_available", { handle: handleA });
    expect(taken).toMatchObject({ data: false, error: null });

    const free = await b.rpc("is_handle_available", {
      handle: `free_${fx.runId}`,
    });
    expect(free).toMatchObject({ data: true, error: null });

    const malformed = await b.rpc("is_handle_available", { handle: "No!" });
    expect(malformed).toMatchObject({ data: false, error: null });
  });

  it("a user's own handle reads as available to them", async () => {
    const own = await a.rpc("is_handle_available", { handle: handleA });
    expect(own).toMatchObject({ data: true, error: null });
  });

  it("anonymous callers cannot probe handles", async () => {
    const { error } = await asAnon().rpc("is_handle_available", {
      handle: handleA,
    });
    expect(error?.code).toBe("42501");
  });
});

describe("onboarding completion", () => {
  it("cannot complete without name, handle and discipline", async () => {
    const { error } = await n
      .from("profiles")
      .update({ onboarded_at: new Date().toISOString() })
      .eq("id", newUser.id)
      .select();
    expect(error?.code).toBe("23514");
  });

  it("is stamped with the server clock and cannot be cleared", async () => {
    await expectRows(
      n
        .from("profiles")
        .update({
          display_name: "New User",
          handle: `n_${fx.runId}`,
          discipline: "analytics_engineer",
        })
        .eq("id", newUser.id)
        .select("id"),
    );

    const before = Date.now();
    const [stamped] = await expectRows(
      n
        .from("profiles")
        .update({ onboarded_at: "2000-01-01T00:00:00Z" })
        .eq("id", newUser.id)
        .select("onboarded_at"),
    );
    const at = Date.parse(stamped!.onboarded_at!);
    expect(at).toBeGreaterThan(before - 60_000);

    const [cleared] = await expectRows(
      n
        .from("profiles")
        .update({ onboarded_at: null })
        .eq("id", newUser.id)
        .select("onboarded_at"),
    );
    expect(Date.parse(cleared!.onboarded_at!)).toBe(at);
  });

  it("users cannot write non-editable profile columns", async () => {
    const { error } = await a
      .from("profiles")
      .update({ created_at: "2000-01-01T00:00:00Z" })
      .eq("id", fx.users.a.id)
      .select();
    expect(error?.code).toBe("42501");
  });
});

describe("joining through a pending invite", () => {
  let mine: string;
  let expired: string;
  let someoneElses: string;

  beforeAll(async () => {
    const { data, error } = await admin
      .from("invites")
      .insert(
        [
          {
            workspace_id: acme,
            email: newUser.email.toUpperCase(),
            role: "member",
            token_hash: `f06-${fx.runId}-mine`,
            invited_by: fx.users.a.id,
          },
          {
            workspace_id: acme,
            email: newUser.email,
            role: "admin",
            token_hash: `f06-${fx.runId}-expired`,
            invited_by: fx.users.a.id,
            expires_at: "2000-01-01T00:00:00Z",
          },
          {
            workspace_id: acme,
            email: `other+rls-${fx.runId}@tessera.test`,
            role: "admin",
            token_hash: `f06-${fx.runId}-other`,
            invited_by: fx.users.a.id,
          },
        ],
        // Omitted columns (expires_at) take their defaults, not null.
        { defaultToNull: false },
      )
      .select("id, token_hash");
    if (error) throw new Error(error.message);
    const id = (suffix: string) =>
      data.find((i) => i.token_hash.endsWith(suffix))!.id;
    [mine, expired, someoneElses] = [id("mine"), id("expired"), id("other")];
  });

  it("lists only live invites for the caller's own email", async () => {
    const { data, error } = await n.rpc("my_pending_invites");
    expect(error).toBeNull();
    expect(data?.map((i) => i.id)).toEqual([mine]);
    expect(data?.[0]).toMatchObject({ workspace_id: acme, role: "member" });

    const others = await b.rpc("my_pending_invites");
    expect(others.data).toEqual([]);
  });

  it("rejects someone else's invite and expired invites", async () => {
    const other = await n.rpc("accept_pending_invite", {
      invite_id: someoneElses,
    });
    expect(other.error?.code).toBe("P0002");

    const stale = await n.rpc("accept_pending_invite", { invite_id: expired });
    expect(stale.error?.code).toBe("22023");

    await expectDenied(
      n.from("workspace_members").select("user_id").eq("workspace_id", acme),
    );
  });

  it("joins with the invite's role, once", async () => {
    const joined = await n.rpc("accept_pending_invite", { invite_id: mine });
    expect(joined).toMatchObject({ data: acme, error: null });

    const members = await expectRows(
      n
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", acme)
        .eq("user_id", newUser.id),
    );
    expect(members).toEqual([{ role: "member" }]);

    const again = await n.rpc("accept_pending_invite", { invite_id: mine });
    expect(again.error?.code).toBe("22023");

    const pending = await n.rpc("my_pending_invites");
    expect(pending.data).toEqual([]);
  });

  it("anonymous callers cannot list or accept invites", async () => {
    const anon = asAnon();
    expect((await anon.rpc("my_pending_invites")).error?.code).toBe("42501");
    expect(
      (await anon.rpc("accept_pending_invite", { invite_id: mine })).error
        ?.code,
    ).toBe("42501");
  });
});

describe("avatars bucket", () => {
  const upload = (
    client: TypedClient,
    path: string,
    body: Buffer = PNG,
    contentType = "image/png",
  ) => client.storage.from("avatars").upload(path, body, { contentType });

  it("the owner uploads into their own folder", async () => {
    const { error } = await upload(a, avatarA);
    expect(error).toBeNull();
  });

  it("nobody uploads into someone else's folder", async () => {
    const { error } = await upload(
      a,
      `${fx.users.v.id}/intruder-${fx.runId}.png`,
    );
    expect(error).not.toBeNull();
  });

  it("rejects non-image types and files over 2 MB", async () => {
    const text = await upload(
      a,
      `${fx.users.a.id}/note-${fx.runId}.txt`,
      Buffer.from("hi"),
      "text/plain",
    );
    expect(text.error).not.toBeNull();

    const svg = await upload(
      a,
      `${fx.users.a.id}/x-${fx.runId}.svg`,
      Buffer.from("<svg/>"),
      "image/svg+xml",
    );
    expect(svg.error).not.toBeNull();

    const big = await upload(
      a,
      `${fx.users.a.id}/big-${fx.runId}.png`,
      Buffer.alloc(2 * 1024 * 1024 + 1),
    );
    expect(big.error).not.toBeNull();
  });

  it("workspace peers can read an avatar; outsiders cannot", async () => {
    const peer = await v.storage.from("avatars").download(avatarA);
    expect(peer.error).toBeNull();

    const outsider = await b.storage.from("avatars").download(avatarA);
    expect(outsider.error).not.toBeNull();
  });

  it("outsiders cannot overwrite or delete an avatar", async () => {
    const { data } = await b.storage.from("avatars").remove([avatarA]);
    expect(data).toEqual([]);

    const still = await admin.storage.from("avatars").download(avatarA);
    expect(still.error).toBeNull();
  });

  it("avatar_path must point into the owner's folder", async () => {
    const { error } = await a
      .from("profiles")
      .update({ avatar_path: `${fx.users.v.id}/x.png` })
      .eq("id", fx.users.a.id)
      .select();
    expect(error?.code).toBe("23514");

    const rows = await expectRows(
      a
        .from("profiles")
        .update({ avatar_path: avatarA })
        .eq("id", fx.users.a.id)
        .select("avatar_path"),
    );
    expect(rows).toEqual([{ avatar_path: avatarA }]);
  });
});
