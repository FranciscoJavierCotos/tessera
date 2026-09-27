import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Workspaces · Tessera" };

// Placeholder landing after sign-in. F07 replaces it with the workspace list
// and a redirect to the last used workspace.
export default async function WorkspacesPage() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data) redirect("/sign-in");

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
          <span className="font-semibold tracking-tight">Tessera</span>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-2 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
        <p className="text-muted-foreground">
          Signed in as{" "}
          <span className="font-medium text-foreground">
            {data.claims.email}
          </span>
          . Workspaces arrive in the next release.
        </p>
      </main>
    </div>
  );
}
