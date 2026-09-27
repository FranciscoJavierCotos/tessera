"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignableRoles,
  canManageMember,
  isLastOwner,
  ROLE_LABELS,
  type WorkspaceRole,
} from "@/lib/workspace/roles";

import {
  changeMemberRole,
  leaveWorkspace,
  removeMember,
  type ActionResult,
} from "./actions";
import { ConfirmButton } from "./confirm-button";

type Member = {
  userId: string;
  role: WorkspaceRole;
  joined: string;
  name: string | null;
  handle: string | null;
  avatar: string | null;
};

export function MemberList({
  workspaceId,
  currentUserId,
  actorRole,
  members,
}: {
  workspaceId: string;
  currentUserId: string;
  actorRole: WorkspaceRole;
  members: Member[];
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const ownerCount = members.filter((m) => m.role === "owner").length;

  const run = (action: () => Promise<ActionResult>, success: string) => {
    setError(undefined);
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else setError(result.message);
    });
  };

  return (
    <section aria-labelledby="members-heading" className="flex flex-col gap-3">
      <h2 id="members-heading" className="text-base font-semibold">
        {members.length} {members.length === 1 ? "member" : "members"}
      </h2>
      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertTitle>Could not update the member</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <ul
        className="flex flex-col divide-y rounded-xl border"
        aria-busy={pending}
      >
        {members.map((member) => {
          const isSelf = member.userId === currentUserId;
          const lastOwner = isLastOwner(member.role, ownerCount);
          const canManage = canManageMember(actorRole, member.role);
          const label = member.name ?? member.handle ?? "Unnamed member";

          return (
            <li
              key={member.userId}
              className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap"
            >
              <ProfileAvatar
                name={member.name}
                src={member.avatar}
                className="size-9 [&_[data-slot=avatar-fallback]]:text-xs"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {member.handle ? (
                    <Link
                      href={`/u/${member.handle}`}
                      className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {label}
                    </Link>
                  ) : (
                    label
                  )}
                  {isSelf && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      (you)
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {member.handle ? `@${member.handle} · ` : ""}Joined{" "}
                  {member.joined}
                </span>
              </div>

              {canManage && !lastOwner ? (
                <Select
                  value={member.role}
                  disabled={pending}
                  onValueChange={(role) =>
                    run(
                      () =>
                        changeMemberRole({
                          workspaceId,
                          userId: member.userId,
                          role: role as WorkspaceRole,
                        }),
                      `${label} is now ${ROLE_LABELS[role as WorkspaceRole].toLowerCase()}`,
                    )
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="w-28"
                    aria-label={`Role of ${label}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles(actorRole).map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge
                  variant="secondary"
                  title={
                    lastOwner
                      ? "The only owner cannot be demoted or removed."
                      : undefined
                  }
                >
                  {ROLE_LABELS[member.role]}
                </Badge>
              )}

              <div className="w-20 text-right">
                {isSelf ? (
                  <ConfirmButton
                    label="Leave"
                    accessibleLabel="Leave workspace"
                    title="Leave this workspace?"
                    description="You lose access right away. Someone will have to invite you again."
                    confirmLabel="Leave workspace"
                    disabled={pending || lastOwner}
                    onConfirm={() =>
                      run(
                        () => leaveWorkspace(workspaceId),
                        "You left the workspace",
                      )
                    }
                  />
                ) : (
                  canManage &&
                  !lastOwner && (
                    <ConfirmButton
                      label="Remove"
                      accessibleLabel={`Remove ${label}`}
                      title={`Remove ${label}?`}
                      description="They lose access to this workspace right away."
                      confirmLabel="Remove member"
                      disabled={pending}
                      onConfirm={() =>
                        run(
                          () =>
                            removeMember({
                              workspaceId,
                              userId: member.userId,
                            }),
                          `${label} was removed`,
                        )
                      }
                    />
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {isLastOwner(actorRole, ownerCount) && (
        <p className="text-xs text-muted-foreground">
          You are the only owner. Make someone else an owner before you leave or
          change your role.
        </p>
      )}
    </section>
  );
}
