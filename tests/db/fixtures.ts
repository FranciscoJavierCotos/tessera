import { randomBytes } from "node:crypto";

import type { Credentials, TypedClient } from "./helpers";

export type FixtureUser = Credentials & { id: string };

/**
 * Per-run fixtures, created by `global-setup.ts` and read in tests with
 * `inject("fixtures")`.
 *
 * | User | Workspace       | Role   |
 * | ---- | --------------- | ------ |
 * | A    | acme (1)        | owner  |
 * | V    | acme (1)        | viewer |
 * | B    | globex (2)      | owner  |
 */
export type Fixtures = {
  runId: string;
  users: { a: FixtureUser; b: FixtureUser; v: FixtureUser };
  workspaces: { acme: string; globex: string };
  entities: {
    /** Owned by A, visibility `workspace`. */
    acmeShared: string;
    /** Owned by A, visibility `private`. */
    acmePrivate: string;
    /** Owned by B, visibility `workspace`. */
    globexShared: string;
  };
};

declare module "vitest" {
  export interface ProvidedContext {
    fixtures: Fixtures;
  }
}

// Emails look like `a+rls-<runId>@tessera.test`.
const FIXTURE_EMAIL = /^[a-z]+\+rls-[a-z0-9]+@tessera\.test$/;
const STALE_AFTER_MS = 60 * 60 * 1000;

export function newRunId(): string {
  return `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

export async function createFixtureUser(
  admin: TypedClient,
  name: string,
  runId: string,
): Promise<FixtureUser> {
  const email = `${name}+rls-${runId}@tessera.test`;
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `RLS ${name.toUpperCase()}` },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return { id: data.user.id, email, password };
}

/**
 * Deletes everything the given users own, then the users (which cascades to
 * profiles and memberships). Rows referencing a profile without `on delete
 * cascade` (entities.owner_id, workspaces.created_by) go first.
 */
export async function deleteFixtureUsers(admin: TypedClient, ids: string[]) {
  if (ids.length === 0) return;
  const entities = await admin.from("entities").delete().in("owner_id", ids);
  if (entities.error) throw new Error(entities.error.message);
  const workspaces = await admin
    .from("workspaces")
    .delete()
    .in("created_by", ids);
  if (workspaces.error) throw new Error(workspaces.error.message);
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(`deleteUser ${id}: ${error.message}`);
  }
}

/** Removes fixture users left behind by crashed runs (older than an hour). */
export async function sweepStaleFixtures(admin: TypedClient) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const cutoff = Date.now() - STALE_AFTER_MS;
  const stale = data.users
    .filter((u) => FIXTURE_EMAIL.test(u.email ?? ""))
    .filter((u) => Date.parse(u.created_at) < cutoff)
    .map((u) => u.id);
  await deleteFixtureUsers(admin, stale);
}
