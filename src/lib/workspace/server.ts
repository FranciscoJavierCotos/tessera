import "server-only";

import { cache } from "react";

import { requireUser } from "@/lib/profile/server";

import type { WorkspaceRole } from "./roles";

export type MyWorkspace = {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
};

/** The signed-in user's workspaces with their role, by name. Per request. */
export const listMyWorkspaces = cache(async (): Promise<MyWorkspace[]> => {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspaces(id, name, slug)")
    .eq("user_id", userId);
  if (error) throw new Error("Could not load your workspaces.");

  return data
    .flatMap(({ role, workspaces }) =>
      workspaces ? [{ ...workspaces, role }] : [],
    )
    .sort((a, b) => a.name.localeCompare(b.name));
});

/** The workspace at `/w/<slug>` if the user belongs to it, else `null`. */
export const getMyWorkspace = cache(
  async (slug: string): Promise<MyWorkspace | null> => {
    const key = decodeURIComponent(slug).toLowerCase();
    const workspaces = await listMyWorkspaces();
    return workspaces.find((w) => w.slug === key) ?? null;
  },
);
