"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { env } from "@/env";
import { fieldErrors, type FormState } from "@/lib/forms";
import { getMailer } from "@/lib/mailer";
import { inviteEmail } from "@/lib/mailer/templates";
import { requireUser } from "@/lib/profile/server";
import { createInviteToken, inviteUrl } from "@/lib/workspace/invite-token";
import { assignableRoles } from "@/lib/workspace/roles";
import {
  changeRoleSchema,
  inviteRefSchema,
  inviteSchema,
  memberRefSchema,
} from "@/lib/workspace/schema";

export type InviteFormState =
  FormState | { status: "invited"; email: string; link: string };

export type ActionResult = { ok: true } | { ok: false; message: string };

const GENERIC_ERROR = "Something went wrong. Try again.";
const NOT_ALLOWED = "You do not have permission to do that.";
const LAST_OWNER =
  "A workspace needs at least one owner. Make someone else an owner first.";
// Raised by the `workspace_members_keep_an_owner` constraint trigger.
const CHECK_VIOLATION = "23514";

/** Every page under the workspace reads memberships. */
function refreshWorkspace() {
  revalidatePath("/w/[workspace]", "layout");
}

/**
 * Creates an invite: stores only the token's hash, emails the link, and
 * returns it once so the inviter can share it directly.
 */
export async function inviteMember(
  _previous: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const workspaceId = z.uuid().safeParse(formData.get("workspaceId"));
  const input = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!workspaceId.success) return { status: "error", message: GENERIC_ERROR };
  if (!input.success) {
    return { status: "error", fieldErrors: fieldErrors(input.error) };
  }
  const { email, role } = input.data;

  const { supabase, userId } = await requireUser();
  const [membership, profile] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("role, workspaces(name)")
      .eq("workspace_id", workspaceId.data)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  const actorRole = membership.data?.role ?? null;
  if (!assignableRoles(actorRole).includes(role)) {
    return { status: "error", message: NOT_ALLOWED };
  }

  // A new invite replaces any pending one for the same address.
  const replaced = await supabase
    .from("invites")
    .delete()
    .eq("workspace_id", workspaceId.data)
    .eq("email", email)
    .is("accepted_at", null);
  if (replaced.error) return { status: "error", message: GENERIC_ERROR };

  const { token, hash } = createInviteToken();
  const { data: invite, error } = await supabase
    .from("invites")
    .insert({
      workspace_id: workspaceId.data,
      email,
      role,
      token_hash: hash,
      invited_by: userId,
    })
    .select("expires_at")
    .single();
  if (error) return { status: "error", message: GENERIC_ERROR };

  const link = inviteUrl(env.NEXT_PUBLIC_SITE_URL, token);
  try {
    await getMailer().send(
      inviteEmail({
        to: email,
        workspaceName: membership.data?.workspaces?.name ?? "a workspace",
        inviterName: profile.data?.display_name ?? null,
        role,
        link,
        expiresAt: new Date(invite.expires_at),
      }),
    );
  } catch (mailError) {
    // The invite exists; the inviter can still share the link by hand.
    console.error("invite email failed", mailError);
  }

  refreshWorkspace();
  return { status: "invited", email, link };
}

export async function changeMemberRole(
  raw: z.input<typeof changeRoleSchema>,
): Promise<ActionResult> {
  const input = changeRoleSchema.safeParse(raw);
  if (!input.success) return { ok: false, message: GENERIC_ERROR };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("workspace_members")
    .update({ role: input.data.role })
    .eq("workspace_id", input.data.workspaceId)
    .eq("user_id", input.data.userId)
    .select("role");
  if (error?.code === CHECK_VIOLATION)
    return { ok: false, message: LAST_OWNER };
  if (error || data.length === 0) return { ok: false, message: NOT_ALLOWED };

  refreshWorkspace();
  return { ok: true };
}

export async function removeMember(
  raw: z.input<typeof memberRefSchema>,
): Promise<ActionResult> {
  const input = memberRefSchema.safeParse(raw);
  if (!input.success) return { ok: false, message: GENERIC_ERROR };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", input.data.workspaceId)
    .eq("user_id", input.data.userId)
    .select("user_id");
  if (error?.code === CHECK_VIOLATION)
    return { ok: false, message: LAST_OWNER };
  if (error || data.length === 0) return { ok: false, message: NOT_ALLOWED };

  refreshWorkspace();
  return { ok: true };
}

/** Removes the signed-in user from the workspace and goes to `/w`. */
export async function leaveWorkspace(raw: string): Promise<ActionResult> {
  const workspaceId = z.uuid().safeParse(raw);
  if (!workspaceId.success) return { ok: false, message: GENERIC_ERROR };

  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId.data)
    .eq("user_id", userId)
    .select("user_id");
  if (error?.code === CHECK_VIOLATION)
    return { ok: false, message: LAST_OWNER };
  if (error || data.length === 0) return { ok: false, message: GENERIC_ERROR };

  refreshWorkspace();
  redirect("/w?all=1");
}

export async function revokeInvite(
  raw: z.input<typeof inviteRefSchema>,
): Promise<ActionResult> {
  const input = inviteRefSchema.safeParse(raw);
  if (!input.success) return { ok: false, message: GENERIC_ERROR };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("invites")
    .delete()
    .eq("workspace_id", input.data.workspaceId)
    .eq("id", input.data.inviteId)
    .select("id");
  if (error || data.length === 0) return { ok: false, message: NOT_ALLOWED };

  refreshWorkspace();
  return { ok: true };
}
