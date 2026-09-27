"use client";

import { ChevronsUpDown, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import { signOut } from "@/app/auth/actions";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
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

export type ShellUser = {
  name: string | null;
  handle: string | null;
  avatar: string | null;
};

/** The signed-in user at the bottom of the sidebar: profile and sign out. */
export function UserMenu({ user }: { user: ShellUser }) {
  const { isMobile } = useSidebar();
  const [pending, startTransition] = useTransition();
  const name = user.name ?? user.handle ?? "Your account";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label={`Account: ${name}`}
              className="data-[state=open]:bg-sidebar-accent"
            >
              <ProfileAvatar
                name={user.name}
                src={user.avatar}
                className="size-8 rounded-lg [&_[data-slot=avatar-fallback]]:text-xs"
              />
              <span className="flex min-w-0 flex-1 flex-col text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                {user.handle && (
                  <span className="truncate text-xs text-muted-foreground">
                    @{user.handle}
                  </span>
                )}
              </span>
              <ChevronsUpDown aria-hidden className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="end"
            className="w-56"
          >
            <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {user.handle && (
                <DropdownMenuItem asChild>
                  <Link href={`/u/${user.handle}`}>
                    <UserRound aria-hidden />
                    Your profile
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={pending}
                onSelect={() => startTransition(() => signOut())}
              >
                <LogOut aria-hidden />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
