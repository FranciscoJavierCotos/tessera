import { ChevronRight, Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/profile/server";
import { LAST_WORKSPACE_COOKIE } from "@/lib/workspace/last-used";
import { workspaceHome } from "@/lib/workspace/paths";
import { ROLE_LABELS } from "@/lib/workspace/roles";
import { listMyWorkspaces } from "@/lib/workspace/server";

import { PendingInvites } from "./pending-invites";

export const metadata: Metadata = { title: "Workspaces · Tessera" };

/**
 * The user's workspaces. Redirects to the last used one unless `?all` is set
 * (the switcher's "All workspaces" link) or it is no longer theirs.
 */
export default async function WorkspacesPage({
  searchParams,
}: PageProps<"/w">) {
  const showAll = (await searchParams).all !== undefined;
  const [workspaces, cookieStore] = await Promise.all([
    listMyWorkspaces(),
    cookies(),
  ]);

  const last = cookieStore.get(LAST_WORKSPACE_COOKIE)?.value?.toLowerCase();
  if (!showAll && last && workspaces.some((w) => w.slug === last)) {
    redirect(workspaceHome(last));
  }

  const { supabase, userId } = await requireUser();
  const [profile, invites] = await Promise.all([
    supabase.from("profiles").select("handle").eq("id", userId).maybeSingle(),
    supabase.rpc("my_pending_invites"),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader handle={profile.data?.handle} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
          <Button asChild>
            <Link href="/w/new">
              <Plus aria-hidden />
              Create workspace
            </Link>
          </Button>
        </div>

        {(invites.data?.length ?? 0) > 0 && (
          <PendingInvites
            invites={(invites.data ?? []).map((invite) => ({
              id: invite.id,
              workspaceName: invite.workspace_name,
              role: invite.role,
              invitedBy: invite.invited_by_name,
            }))}
          />
        )}

        {workspaces.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
            <Users aria-hidden className="size-8 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <h2 className="font-medium">You are not in a workspace yet</h2>
              <p className="text-sm text-muted-foreground">
                Create one for your team, or ask a teammate for an invite.
              </p>
            </div>
          </div>
        ) : (
          <section aria-labelledby="your-workspaces">
            <h2 id="your-workspaces" className="sr-only">
              Your workspaces
            </h2>
            <ul className="flex flex-col gap-2">
              {workspaces.map((workspace) => (
                <li key={workspace.id}>
                  <Link
                    href={workspaceHome(workspace.slug)}
                    prefetch={false}
                    className="flex items-center justify-between gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        {workspace.name}
                      </span>
                      <span className="truncate text-sm text-muted-foreground">
                        /w/{workspace.slug}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {ROLE_LABELS[workspace.role]}
                      </Badge>
                      <ChevronRight
                        aria-hidden
                        className="size-4 text-muted-foreground"
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
