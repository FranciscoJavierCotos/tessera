import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { RememberWorkspace } from "@/components/app/remember-workspace";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import { requireUser } from "@/lib/profile/server";
import { getMyWorkspace, listMyWorkspaces } from "@/lib/workspace/server";

/**
 * Frame for every page inside a workspace. Non-members get a 404: the
 * workspace is looked up among the user's own memberships (RLS-scoped).
 * F08 replaces this with the full app shell.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: LayoutProps<"/w/[workspace]">) {
  const { workspace: slug } = await params;
  const [workspace, workspaces] = await Promise.all([
    getMyWorkspace(slug),
    listMyWorkspaces(),
  ]);
  if (!workspace) notFound();

  const { supabase, userId } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle")
    .eq("id", userId)
    .maybeSingle();

  return (
    <div className="flex flex-1 flex-col">
      <RememberWorkspace slug={workspace.slug} />
      <AppHeader
        handle={profile?.handle}
        switcher={
          <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
        }
      />
      {children}
    </div>
  );
}
