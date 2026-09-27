import type { Metadata } from "next";

import { AppHeader } from "@/components/app/app-header";
import { requireUser } from "@/lib/profile/server";

export const metadata: Metadata = { title: "Workspaces · Tessera" };

// Placeholder landing after sign-in. F07 replaces it with the workspace list
// and a redirect to the last used workspace.
export default async function WorkspacesPage() {
  const { supabase, userId, email } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle")
    .eq("id", userId)
    .maybeSingle();

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader handle={profile?.handle} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-2 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
        <p className="text-muted-foreground">
          Signed in as{" "}
          <span className="font-medium text-foreground">{email}</span>.
          Workspaces arrive in the next release.
        </p>
      </main>
    </div>
  );
}
