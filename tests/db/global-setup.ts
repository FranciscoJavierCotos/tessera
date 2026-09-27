import type { TestProject } from "vitest/node";

import {
  createFixtureUser,
  deleteFixtureUsers,
  newRunId,
  sweepStaleFixtures,
  type Fixtures,
} from "./fixtures";
import { createAdminClient, type TypedClient } from "./helpers";

/**
 * Creates the per-run fixtures on the Supabase Cloud project through the
 * service role and deletes them when the run ends. Tests never use the seed.
 */
export default async function setup(project: TestProject) {
  const admin = createAdminClient();
  await sweepStaleFixtures(admin);

  const runId = newRunId();
  const userIds: string[] = [];
  const teardown = () => deleteFixtureUsers(admin, userIds);

  try {
    const [a, b, v] = await Promise.all(
      ["a", "b", "v"].map((name) => createFixtureUser(admin, name, runId)),
    );
    if (!a || !b || !v) throw new Error("fixture users were not created");
    userIds.push(a.id, b.id, v.id);

    const acme = await createWorkspace(admin, `acme-${runId}`, a.id);
    const globex = await createWorkspace(admin, `globex-${runId}`, b.id);

    const member = await admin
      .from("workspace_members")
      .insert({ workspace_id: acme, user_id: v.id, role: "viewer" });
    if (member.error) throw new Error(member.error.message);

    const fixtures: Fixtures = {
      runId,
      users: { a, b, v },
      workspaces: { acme, globex },
      entities: {
        acmeShared: await createEntity(admin, acme, a.id, "workspace"),
        acmePrivate: await createEntity(admin, acme, a.id, "private"),
        globexShared: await createEntity(admin, globex, b.id, "workspace"),
      },
    };
    project.provide("fixtures", fixtures);
  } catch (error) {
    await teardown();
    throw error;
  }

  return teardown;
}

// The `on_workspace_created` trigger makes `createdBy` the owner.
async function createWorkspace(
  admin: TypedClient,
  slug: string,
  createdBy: string,
) {
  const { data, error } = await admin
    .from("workspaces")
    .insert({ name: slug, slug, created_by: createdBy })
    .select("id")
    .single();
  if (error) throw new Error(`workspace ${slug}: ${error.message}`);
  return data.id;
}

async function createEntity(
  admin: TypedClient,
  workspaceId: string,
  ownerId: string,
  visibility: "private" | "workspace",
) {
  const { data, error } = await admin
    .from("entities")
    .insert({
      workspace_id: workspaceId,
      owner_id: ownerId,
      type: "asset",
      title: `RLS ${visibility} entity`,
      visibility,
    })
    .select("id")
    .single();
  if (error) throw new Error(`entity: ${error.message}`);
  return data.id;
}
