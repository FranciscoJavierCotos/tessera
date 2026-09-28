import { Constants, type Database } from "@/lib/db/types";
import { hasRole, type WorkspaceRole } from "@/lib/workspace/roles";

export type ProjectRole = Database["public"]["Enums"]["project_role"];
export type ProjectStatus = Database["public"]["Enums"]["project_status"];
type EntityVisibility = Database["public"]["Enums"]["visibility"];

/** Who can see a project. A private project is an entity scoped to itself. */
export type ProjectVisibility = "workspace" | "private";

/** Most to least privileged. */
export const PROJECT_ROLES = Constants.public.Enums.project_role;
/** In lifecycle order. */
export const PROJECT_STATUSES = Constants.public.Enums.project_status;
export const PROJECT_VISIBILITIES = [
  "workspace",
  "private",
] as const satisfies readonly ProjectVisibility[];

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  lead: "Lead",
  contributor: "Contributor",
  viewer: "Viewer",
};

export const PROJECT_ROLE_DESCRIPTIONS: Record<ProjectRole, string> = {
  lead: "Edits the project, manages its members, archives it.",
  contributor: "Edits the project.",
  viewer: "Read-only access.",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  paused: "Paused",
  done: "Done",
};

export const VISIBILITY_LABELS: Record<ProjectVisibility, string> = {
  workspace: "Workspace",
  private: "Private",
};

export const VISIBILITY_DESCRIPTIONS: Record<ProjectVisibility, string> = {
  workspace: "Everyone in the workspace can see it.",
  private: "Only project members (and workspace admins) can see it.",
};

/** The project visibility behind an entity's visibility. */
export function projectVisibility(
  visibility: EntityVisibility,
): ProjectVisibility {
  return visibility === "workspace" ? "workspace" : "private";
}

// These mirror `private.has_project_access` so the UI only offers what the
// database will accept. The database is the gate.

function hasProjectAccess(
  workspaceRole: WorkspaceRole | null,
  projectRole: ProjectRole | null,
  roles: readonly ProjectRole[],
): boolean {
  if (workspaceRole === "owner" || workspaceRole === "admin") return true;
  return (
    workspaceRole === "member" &&
    projectRole !== null &&
    roles.includes(projectRole)
  );
}

/** Workspace members (not viewers) create projects. */
export function canCreateProject(workspaceRole: WorkspaceRole | null): boolean {
  return hasRole(workspaceRole, "member");
}

/** Edit name, slug, description and status. */
export function canEditProject(
  workspaceRole: WorkspaceRole | null,
  projectRole: ProjectRole | null,
): boolean {
  return hasProjectAccess(workspaceRole, projectRole, ["lead", "contributor"]);
}

/** Archive, change visibility and manage members. */
export function canManageProject(
  workspaceRole: WorkspaceRole | null,
  projectRole: ProjectRole | null,
): boolean {
  return hasProjectAccess(workspaceRole, projectRole, ["lead"]);
}
