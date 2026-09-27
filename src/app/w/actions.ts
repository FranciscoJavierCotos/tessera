"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { fieldErrors, type FormState } from "@/lib/forms";
import { workspaceSchema } from "@/lib/profile/schema";
import { requireUser, UNIQUE_VIOLATION } from "@/lib/profile/server";

const GENERIC_ERROR = "Something went wrong. Try again.";

/** Creates a workspace (the caller becomes its owner) and opens it. */
export async function createWorkspace(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = workspaceSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
  if (!input.success) {
    return { status: "error", fieldErrors: fieldErrors(input.error) };
  }

  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_workspace", input.data);
  if (error?.code === UNIQUE_VIOLATION) {
    return {
      status: "error",
      fieldErrors: { slug: "That URL is taken. Try another." },
    };
  }
  if (error || !data) return { status: "error", message: GENERIC_ERROR };

  redirect(`/w/${data.slug}`);
}

const pendingInviteInput = z.object({ inviteId: z.uuid() });

/** Joins a workspace through a pending invite for the user's email. */
export async function joinPendingInvite(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = pendingInviteInput.safeParse({
    inviteId: formData.get("inviteId"),
  });
  if (!input.success) return { status: "error", message: GENERIC_ERROR };

  const { supabase } = await requireUser();
  const { data: workspaceId, error } = await supabase.rpc(
    "accept_pending_invite",
    { invite_id: input.data.inviteId },
  );
  if (error || !workspaceId) {
    return {
      status: "error",
      message: "This invite is no longer valid. Ask for a new one.",
    };
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("slug")
    .eq("id", workspaceId)
    .single();
  redirect(workspace ? `/w/${workspace.slug}` : "/w");
}
