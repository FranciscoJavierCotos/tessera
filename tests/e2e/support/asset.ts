import { randomUUID } from "node:crypto";

import type { createAdminClient, TestUser } from "./auth";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * A workspace-visible dataset owned by `owner`, with `columns`. Deleted with
 * the workspace. Returns its id.
 */
export async function createDataset(
  admin: Admin,
  {
    workspaceId,
    owner,
    name,
    qualifiedName,
    columns = [],
  }: {
    workspaceId: string;
    owner: TestUser;
    name: string;
    qualifiedName: string;
    columns?: { name: string; isPii?: boolean }[];
  },
) {
  const id = randomUUID();
  const entity = await admin.from("entities").insert({
    id,
    workspace_id: workspaceId,
    type: "asset",
    title: name,
    owner_id: owner.id,
  });
  if (entity.error) throw new Error(`entity: ${entity.error.message}`);
  const asset = await admin.from("assets").insert({
    id,
    workspace_id: workspaceId,
    kind: "dataset",
    qualified_name: qualifiedName,
  });
  if (asset.error) throw new Error(`asset: ${asset.error.message}`);
  if (columns.length) {
    const added = await admin.from("dataset_columns").insert(
      columns.map((column, ordinal) => ({
        asset_id: id,
        workspace_id: workspaceId,
        name: column.name,
        is_pii: column.isPii ?? false,
        ordinal,
      })),
    );
    if (added.error) throw new Error(`columns: ${added.error.message}`);
  }
  return id;
}
