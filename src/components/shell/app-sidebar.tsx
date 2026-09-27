"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { activeFeature, featuresFor, type Feature } from "@/features/registry";
import { ROLE_LABELS, type WorkspaceRole } from "@/lib/workspace/roles";

import { UserMenu, type ShellUser } from "./user-menu";

type Workspace = { id: string; name: string; slug: string };

function FeatureLinks({
  features,
  slug,
  activeId,
}: {
  features: Feature[];
  slug: string;
  activeId: string | undefined;
}) {
  return (
    <SidebarMenu>
      {features.map(({ id, label, icon: Icon, href }) => {
        const active = id === activeId;
        return (
          <SidebarMenuItem key={id}>
            <SidebarMenuButton asChild isActive={active} tooltip={label}>
              <Link
                href={href(slug)}
                aria-current={active ? "page" : undefined}
              >
                <Icon aria-hidden />
                <span>{label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

/**
 * The workspace sidebar: switcher, the feature registry's entries for the
 * user's role, and the account menu. Collapses to icons (Ctrl/Cmd+B) and
 * becomes a drawer below 768px.
 */
export function AppSidebar({
  workspace,
  workspaces,
  role,
  user,
}: {
  workspace: Workspace;
  workspaces: Workspace[];
  role: WorkspaceRole;
  user: ShellUser;
}) {
  const pathname = usePathname();
  const features = featuresFor(role);
  const activeId = activeFeature(pathname, workspace.slug, features)?.id;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher
          current={workspace}
          workspaces={workspaces}
          roleLabel={ROLE_LABELS[role]}
        />
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Workspace" className="flex flex-1 flex-col">
          <SidebarGroup>
            <SidebarGroupContent>
              <FeatureLinks
                features={features.filter((f) => f.group === "primary")}
                slug={workspace.slug}
                activeId={activeId}
              />
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <FeatureLinks
                features={features.filter((f) => f.group === "secondary")}
                slug={workspace.slug}
                activeId={activeId}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
