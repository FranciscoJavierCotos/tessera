import "server-only";

import { cache } from "react";

import { requireUser } from "@/lib/profile/server";

import {
  projectVisibility,
  type ProjectRole,
  type ProjectStatus,
  type ProjectVisibility,
} from "./roles";

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  archivedAt: string | null;
  updatedAt: string;
  /** The signed-in user's role in the project, `null` when not a member. */
  myRole: ProjectRole | null;
};

/**
 * The project at `/w/<workspace>/projects/<slug>` if the user can see it,
 * else `null` (RLS hides private projects from non-members). Per request.
 */
export const getProject = cache(
  async (workspaceId: string, slug: string): Promise<Project | null> => {
    const { supabase, userId } = await requireUser();
    const { data, error } = await supabase
      .from("projects")
      .select(
        "id, workspace_id, slug, description, status, archived_at, updated_at, entities(title, visibility)",
      )
      .eq("workspace_id", workspaceId)
      .eq("slug", decodeURIComponent(slug).toLowerCase())
      .maybeSingle();
    if (error) throw new Error("Could not load the project.");
    if (!data?.entities) return null;

    const { data: membership } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", data.id)
      .eq("user_id", userId)
      .maybeSingle();

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      name: data.entities.title,
      slug: data.slug,
      description: data.description,
      status: data.status,
      visibility: projectVisibility(data.entities.visibility),
      archivedAt: data.archived_at,
      updatedAt: data.updated_at,
      myRole: membership?.role ?? null,
    };
  },
);
