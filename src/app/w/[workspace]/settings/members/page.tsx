import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { avatarUrl, requireUser } from "@/lib/profile/server";
import { assignableRoles, canManageMembers } from "@/lib/workspace/roles";
import { getMyWorkspace } from "@/lib/workspace/server";

import { InviteForm } from "./invite-form";
import { InviteList } from "./invite-list";
import { MemberList } from "./member-list";

export async function generateMetadata({
  params,
}: PageProps<"/w/[workspace]/settings/members">): Promise<Metadata> {
  const workspace = await getMyWorkspace((await params).workspace);
  return { title: `Members · ${workspace?.name ?? "Workspace"} · Tessera` };
}

/** `YYYY-MM-DD` in UTC (stable across server and client). */
function day(timestamp: string) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function isPast(timestamp: string) {
  return Date.parse(timestamp) <= Date.now();
}

export default async function MembersPage({
  params,
}: PageProps<"/w/[workspace]/settings/members">) {
  const workspace = await getMyWorkspace((await params).workspace);
  if (!workspace) notFound();

  const { supabase, userId } = await requireUser();
  const canManage = canManageMembers(workspace.role);

  const [members, invites] = await Promise.all([
    supabase
      .from("workspace_members")
      .select(
        "user_id, role, joined_at, profiles(display_name, handle, avatar_path)",
      )
      .eq("workspace_id", workspace.id)
      .order("joined_at"),
    canManage
      ? supabase
          .from("invites")
          .select("id, email, role, expires_at")
          .eq("workspace_id", workspace.id)
          .is("accepted_at", null)
          .order("created_at", { ascending: false })
      : null,
  ]);
  if (members.error || invites?.error) {
    throw new Error("Could not load the members.");
  }

  const avatars = await Promise.all(
    members.data.map((m) =>
      avatarUrl(supabase, m.profiles?.avatar_path ?? null),
    ),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground">
          {canManage
            ? `Invite people to ${workspace.name} and manage what they can do.`
            : `People in ${workspace.name}. Owners and admins manage members.`}
        </p>
      </div>

      {canManage && (
        <InviteForm
          workspaceId={workspace.id}
          roles={assignableRoles(workspace.role)}
        />
      )}

      <MemberList
        workspaceId={workspace.id}
        currentUserId={userId}
        actorRole={workspace.role}
        members={members.data.map((member, index) => ({
          userId: member.user_id,
          role: member.role,
          joined: day(member.joined_at),
          name: member.profiles?.display_name ?? null,
          handle: member.profiles?.handle ?? null,
          avatar: avatars[index] ?? null,
        }))}
      />

      {canManage && invites && (
        <InviteList
          workspaceId={workspace.id}
          invites={invites.data.map((invite) => ({
            id: invite.id,
            email: invite.email,
            role: invite.role,
            expires: day(invite.expires_at),
            expired: isPast(invite.expires_at),
          }))}
        />
      )}
    </main>
  );
}
