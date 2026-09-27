import { Constants, type Database } from "@/lib/db/types";

export type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];

/** Most to least privileged. */
export const WORKSPACE_ROLES = Constants.public.Enums.workspace_role;

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  owner: "Full control, including billing and deleting the workspace.",
  admin: "Manages members and invites, and everything a member can.",
  member: "Creates and edits content.",
  viewer: "Read-only access.",
};

/** Whether `role` is `min` or more privileged. */
export function hasRole(
  role: WorkspaceRole | null,
  min: WorkspaceRole,
): boolean {
  if (!role) return false;
  return WORKSPACE_ROLES.indexOf(role) <= WORKSPACE_ROLES.indexOf(min);
}

// These mirror the RLS policies on `workspace_members` and `invites` so the
// UI only offers what the database will accept. The database is the gate.

/** Owners and admins manage members and invites. */
export function canManageMembers(role: WorkspaceRole | null): boolean {
  return role === "owner" || role === "admin";
}

/** Roles `actor` may grant (to a member or through an invite). */
export function assignableRoles(actor: WorkspaceRole | null): WorkspaceRole[] {
  if (actor === "owner") return [...WORKSPACE_ROLES];
  if (actor === "admin") return ["admin", "member", "viewer"];
  return [];
}

/** Whether `actor` may change the role of, or remove, a member with `target`. */
export function canManageMember(
  actor: WorkspaceRole | null,
  target: WorkspaceRole,
): boolean {
  if (actor === "owner") return true;
  return actor === "admin" && target !== "owner";
}

/**
 * Whether the member with `role` is the workspace's only owner: they cannot
 * leave, be removed or be demoted (the DB rejects it).
 */
export function isLastOwner(role: WorkspaceRole, ownerCount: number): boolean {
  return role === "owner" && ownerCount <= 1;
}
