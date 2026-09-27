"use client";

import { Check, ChevronsUpDown, LayoutGrid, Plus } from "lucide-react";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { workspaceHome } from "@/lib/workspace/paths";

type Workspace = { id: string; name: string; slug: string };

/** Sidebar menu to jump between the user's workspaces or create one. */
export function WorkspaceSwitcher({
  current,
  workspaces,
  roleLabel,
}: {
  current: Workspace;
  workspaces: Workspace[];
  /** The user's role in `current`, shown under its name. */
  roleLabel: string;
}) {
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label={`Workspace: ${current.name}. Switch workspace`}
              className="data-[state=open]:bg-sidebar-accent"
            >
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground"
              >
                {current.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-1 flex-col text-left text-sm leading-tight">
                <span className="truncate font-medium">{current.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {roleLabel}
                </span>
              </span>
              <ChevronsUpDown aria-hidden className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side={isMobile ? "bottom" : "right"}
            className="w-64"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              {workspaces.map((workspace) => {
                const active = workspace.id === current.id;
                return (
                  <DropdownMenuItem key={workspace.id} asChild>
                    <Link
                      href={workspaceHome(workspace.slug)}
                      aria-current={active ? "page" : undefined}
                      prefetch={false}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{workspace.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          /w/{workspace.slug}
                        </span>
                      </span>
                      {active && <Check aria-hidden />}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/w/new">
                <Plus aria-hidden />
                Create workspace
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/w?all=1">
                <LayoutGrid aria-hidden />
                All workspaces
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
