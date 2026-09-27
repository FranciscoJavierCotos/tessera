import type { Metadata } from "next";
import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/profile/server";
import { inviteTokenSchema } from "@/lib/workspace/invite-token";
import { ROLE_LABELS } from "@/lib/workspace/roles";

import { AcceptInviteForm } from "./accept-form";

export const metadata: Metadata = {
  title: "Workspace invite · Tessera",
  referrer: "no-referrer",
};

function BackLink() {
  return (
    <Button asChild variant="outline">
      <Link href="/w">Go to your workspaces</Link>
    </Button>
  );
}

export default async function InvitePage({
  params,
}: PageProps<"/invite/[token]">) {
  const token = inviteTokenSchema.safeParse((await params).token);
  const { supabase, email } = await requireUser();

  const { data, error } = token.success
    ? await supabase.rpc("invite_preview", { token: token.data })
    : { data: [], error: null };
  if (error) throw new Error("Could not load the invite.");
  const invite = data[0];

  if (!token.success || !invite) {
    return (
      <AuthShell
        title="Invite not found"
        description="This link is not valid. It may have been revoked or replaced by a newer invite. Ask for a new one."
      >
        <BackLink />
      </AuthShell>
    );
  }

  if (invite.is_member) {
    return (
      <AuthShell
        title={`You are in ${invite.workspace_name}`}
        description="You are already a member of this workspace."
      >
        <Button asChild>
          <Link href={`/w/${invite.workspace_slug}`}>
            Open {invite.workspace_name}
          </Link>
        </Button>
      </AuthShell>
    );
  }

  if (invite.status !== "pending") {
    return (
      <AuthShell
        title={
          invite.status === "expired"
            ? "This invite has expired"
            : "This invite was already used"
        }
        description={`Ask someone in ${invite.workspace_name} to send you a new invite.`}
      >
        <BackLink />
      </AuthShell>
    );
  }

  if (!invite.email_matches) {
    return (
      <AuthShell
        title="This invite is for someone else"
        description={
          <>
            You are signed in as{" "}
            <span className="font-medium text-foreground">{email}</span>, but
            the invite to {invite.workspace_name} was sent to a different
            address. Sign in with the invited email to accept it.
          </>
        }
      >
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Join ${invite.workspace_name}`}
      description={
        <>
          {invite.invited_by_name ?? "A teammate"} invited you to join as{" "}
          <span className="font-medium text-foreground">
            {ROLE_LABELS[invite.role].toLowerCase()}
          </span>
          .
        </>
      }
    >
      <AcceptInviteForm
        token={token.data}
        workspaceName={invite.workspace_name}
      />
    </AuthShell>
  );
}
