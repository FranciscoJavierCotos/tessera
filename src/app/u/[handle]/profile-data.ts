import "server-only";

import { cache } from "react";

import { handleSchema } from "@/lib/profile/schema";
import { requireUser } from "@/lib/profile/server";

/**
 * The profile behind `/u/[handle]`, or `null` when the handle is malformed,
 * unknown, or belongs to someone the viewer shares no workspace with (RLS
 * hides it). Cached per request so metadata and page share one query.
 */
export const loadProfile = cache(async (rawHandle: string) => {
  const handle = handleSchema.safeParse(rawHandle);
  const { supabase, userId } = await requireUser();
  if (!handle.success) return { supabase, userId, profile: null };

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, handle, display_name, discipline, bio, skills, links, avatar_path",
    )
    .eq("handle", handle.data)
    .maybeSingle();
  if (error) throw new Error("Could not load this profile.");

  return { supabase, userId, profile: data };
});
