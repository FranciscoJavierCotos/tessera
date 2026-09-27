"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { safeNextPath } from "@/lib/auth/redirect";
import { fieldErrors, type FormState } from "@/lib/forms";
import {
  handleSchema,
  identitySchema,
  workspaceSchema,
} from "@/lib/profile/schema";
import {
  requireUser,
  UNIQUE_VIOLATION,
  type ServerClient,
} from "@/lib/profile/server";

export type HandleAvailability =
  | { status: "available" }
  | { status: "taken" }
  | { status: "invalid"; message: string }
  | { status: "error" };

const GENERIC_ERROR = "Something went wrong. Try again.";

/** Live availability check for the handle step (the DB still has the final say). */
export async function checkHandle(raw: string): Promise<HandleAvailability> {
  const handle = handleSchema.safeParse(raw);
  if (!handle.success) {
    return {
      status: "invalid",
      message: handle.error.issues[0]?.message ?? "Invalid handle.",
    };
  }
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("is_handle_available", {
    handle: handle.data,
  });
  if (error) return { status: "error" };
  return { status: data ? "available" : "taken" };
}

/** Steps 1–3: saves display name, handle and discipline. */
export async function saveIdentity(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = identitySchema.safeParse({
    displayName: formData.get("displayName"),
    handle: formData.get("handle"),
    discipline: formData.get("discipline"),
  });
  if (!input.success) {
    return { status: "error", fieldErrors: fieldErrors(input.error) };
  }

  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: input.data.displayName,
      handle: input.data.handle,
      discipline: input.data.discipline,
    })
    .eq("id", userId);

  if (error?.code === UNIQUE_VIOLATION) {
    return {
      status: "error",
      fieldErrors: { handle: "That handle was just taken. Try another." },
    };
  }
  if (error) return { status: "error", message: GENERIC_ERROR };
  return { status: "saved" };
}

/** Stamps `onboarded_at` and leaves onboarding. Needs a workspace membership. */
async function finish(
  supabase: ServerClient,
  userId: string,
  next: FormDataEntryValue | null,
): Promise<FormState> {
  const { count } = await supabase
    .from("workspace_members")
    .select("workspace_id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (!count) {
    return { status: "error", message: "Create or join a workspace first." };
  }

  // The DB stamps the server time and rejects this if the identity is incomplete.
  const { error } = await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) {
    return {
      status: "error",
      message: "Finish your profile (name, handle and discipline) first.",
    };
  }

  redirect(safeNextPath(next));
}

/** Step 4a: creates a workspace (the caller becomes owner) and finishes. */
export async function createWorkspaceAndFinish(
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

  const { supabase, userId } = await requireUser();
  const { error } = await supabase.rpc("create_workspace", input.data);
  if (error?.code === UNIQUE_VIOLATION) {
    return {
      status: "error",
      fieldErrors: { slug: "That URL is taken. Try another." },
    };
  }
  if (error) return { status: "error", message: GENERIC_ERROR };

  return finish(supabase, userId, formData.get("next"));
}

const inviteInput = z.object({ inviteId: z.uuid() });

/** Step 4b: joins a workspace through a pending invite and finishes. */
export async function joinWorkspaceAndFinish(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = inviteInput.safeParse({ inviteId: formData.get("inviteId") });
  if (!input.success) return { status: "error", message: GENERIC_ERROR };

  const { supabase, userId } = await requireUser();
  const { error } = await supabase.rpc("accept_pending_invite", {
    invite_id: input.data.inviteId,
  });
  if (error) {
    return {
      status: "error",
      message: "This invite is no longer valid. Ask for a new one.",
    };
  }

  return finish(supabase, userId, formData.get("next"));
}

/** Step 4c: the user already belongs to a workspace; just finish. */
export async function continueAndFinish(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, userId } = await requireUser();
  return finish(supabase, userId, formData.get("next"));
}
