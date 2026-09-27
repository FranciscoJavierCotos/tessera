"use server";

import { redirect } from "next/navigation";

import type { FormState } from "@/lib/forms";
import { requireUser } from "@/lib/profile/server";
import { inviteTokenSchema } from "@/lib/workspace/invite-token";

/** Accepts the invite behind `token` and opens its workspace. */
export async function acceptInvite(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = inviteTokenSchema.safeParse(formData.get("token"));
  const invalid: FormState = {
    status: "error",
    message: "This invite is no longer valid. Ask for a new one.",
  };
  if (!token.success) return invalid;

  const { supabase } = await requireUser();
  const { data: workspaceId, error } = await supabase.rpc("accept_invite", {
    token: token.data,
  });
  if (error || !workspaceId) return invalid;

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("slug")
    .eq("id", workspaceId)
    .single();
  redirect(workspace ? `/w/${workspace.slug}` : "/w");
}
