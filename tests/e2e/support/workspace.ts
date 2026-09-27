import { uniqueId, type createAdminClient, type TestUser } from "./auth";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * A workspace created by `owner` (the DB trigger makes them owner). Deleted
 * with the owner by the `createUser` fixture.
 */
export async function createWorkspace(
  admin: Admin,
  owner: TestUser,
  name: string,
) {
  const slug = `e2e-${uniqueId()}`;
  const { error } = await admin
    .from("workspaces")
    .insert({ name, slug, created_by: owner.id });
  if (error) throw new Error(`workspace: ${error.message}`);
  return slug;
}
