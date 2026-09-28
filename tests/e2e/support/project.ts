import { randomUUID } from "node:crypto";

import { uniqueId, type createAdminClient, type TestUser } from "./auth";

type Admin = ReturnType<typeof createAdminClient>;

/** Adds `user` to the workspace at `slug` with `role`; returns its id. */
export async function addWorkspaceMember(
  admin: Admin,
  slug: string,
  user: TestUser,
  role: "admin" | "member" | "viewer" = "member",
) {
  const { data: workspace, error } = await admin
    .from("workspaces")
    .select("id")
    .eq("slug", slug)
    .single();
  if (error) throw new Error(`workspace: ${error.message}`);
  const member = await admin
    .from("workspace_members")
    .insert({ workspace_id: workspace.id, user_id: user.id, role });
  if (member.error) throw new Error(`member: ${member.error.message}`);
  return workspace.id;
}

/**
 * An active project in `workspaceId` led by `lead` (the DB trigger adds
 * them), plus `members`. Deleted with the workspace. Returns its slug.
 */
export async function createProject(
  admin: Admin,
  {
    workspaceId,
    lead,
    name,
    isPrivate = false,
    members = [],
  }: {
    workspaceId: string;
    lead: TestUser;
    name: string;
    isPrivate?: boolean;
    members?: { user: TestUser; role: "lead" | "contributor" | "viewer" }[];
  },
) {
  const id = randomUUID();
  const slug = `p-${uniqueId()}`;
  const entity = await admin.from("entities").insert({
    id,
    workspace_id: workspaceId,
    type: "project",
    title: name,
    owner_id: lead.id,
    visibility: isPrivate ? "project" : "workspace",
    project_id: isPrivate ? id : null,
  });
  if (entity.error) throw new Error(`entity: ${entity.error.message}`);
  const project = await admin
    .from("projects")
    .insert({ id, workspace_id: workspaceId, slug, status: "active" });
  if (project.error) throw new Error(`project: ${project.error.message}`);
  if (members.length) {
    const added = await admin.from("project_members").insert(
      members.map(({ user, role }) => ({
        project_id: id,
        workspace_id: workspaceId,
        user_id: user.id,
        role,
      })),
    );
    if (added.error) throw new Error(`members: ${added.error.message}`);
  }
  return slug;
}
