"use client";

import { Check, ChevronsUpDown, LayoutGrid, Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Workspace = { id: string; name: string; slug: string };

/** Header menu to jump between the user's workspaces or create one. */
export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: Workspace;
  workspaces: Workspace[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="max-w-56"
          aria-label={`Workspace: ${current.name}. Switch workspace`}
        >
          <span className="truncate">{current.name}</span>
          <ChevronsUpDown aria-hidden className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.map((workspace) => {
            const active = workspace.id === current.id;
            return (
              <DropdownMenuItem key={workspace.id} asChild>
                <Link
                  href={`/w/${workspace.slug}`}
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
  );
}
