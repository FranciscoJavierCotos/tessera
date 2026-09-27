import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { RememberWorkspace } from "@/components/app/remember-workspace";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { avatarUrl, requireUser } from "@/lib/profile/server";
import { getMyWorkspace, listMyWorkspaces } from "@/lib/workspace/server";

/** Written by the sidebar when it is expanded or collapsed. */
const SIDEBAR_COOKIE = "sidebar_state";

/**
 * The app shell for every page inside a workspace: sidebar (feature
 * registry), top bar with breadcrumbs, and the page in `<main>`. Non-members
 * get a 404: the workspace is looked up among the user's own memberships
 * (RLS-scoped).
 */
export default async function WorkspaceLayout({
  children,
  params,
}: LayoutProps<"/w/[workspace]">) {
  const { workspace: slug } = await params;
  const [workspace, workspaces, cookieStore] = await Promise.all([
    getMyWorkspace(slug),
    listMyWorkspaces(),
    cookies(),
  ]);
  if (!workspace) notFound();

  const { supabase, userId } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, handle, avatar_path")
    .eq("id", userId)
    .maybeSingle();
  const avatar = await avatarUrl(supabase, profile?.avatar_path ?? null);

  return (
    <SidebarProvider
      defaultOpen={cookieStore.get(SIDEBAR_COOKIE)?.value !== "false"}
    >
      <RememberWorkspace slug={workspace.slug} />
      <a
        href="#content"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        Skip to content
      </a>
      <AppSidebar
        workspace={workspace}
        workspaces={workspaces}
        role={workspace.role}
        user={{
          name: profile?.display_name ?? null,
          handle: profile?.handle ?? null,
          avatar,
        }}
      />
      <SidebarInset className="min-w-0">
        <TopBar workspace={workspace} />
        <main
          id="content"
          tabIndex={-1}
          className="flex flex-1 flex-col focus:outline-none"
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
