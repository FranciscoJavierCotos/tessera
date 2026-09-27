import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { safeNextPath } from "@/lib/auth/redirect";
import { requireUser } from "@/lib/profile/server";

import { OnboardingFlow } from "./onboarding-flow";

export const metadata: Metadata = { title: "Welcome · Tessera" };

export default async function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding">) {
  const next = safeNextPath((await searchParams).next);
  const { supabase, userId } = await requireUser();

  const [profile, invites, memberships] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, handle, discipline, onboarded_at")
      .eq("id", userId)
      .single(),
    supabase.rpc("my_pending_invites"),
    supabase
      .from("workspace_members")
      .select("role, workspaces(id, name, slug)")
      .eq("user_id", userId),
  ]);

  if (profile.error) throw new Error("Could not load your profile.");
  if (profile.data.onboarded_at) redirect(next);

  return (
    <AuthShell
      wide
      title="Welcome to Tessera"
      description="Set up your profile and your team's workspace. It takes a minute."
    >
      <OnboardingFlow
        next={next}
        initial={{
          displayName: profile.data.display_name ?? "",
          handle: profile.data.handle ?? "",
          discipline: profile.data.discipline,
        }}
        invites={(invites.data ?? []).map((invite) => ({
          id: invite.id,
          workspaceName: invite.workspace_name,
          role: invite.role,
          invitedBy: invite.invited_by_name,
        }))}
        workspaces={(memberships.data ?? []).flatMap(({ workspaces }) =>
          workspaces ? [{ id: workspaces.id, name: workspaces.name }] : [],
        )}
      />
    </AuthShell>
  );
}
