"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/confirm-button";
import { FieldError } from "@/components/form/field-error";
import { SubmitButton } from "@/components/form/submit-button";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FormState } from "@/lib/forms";
import {
  PROJECT_ROLE_LABELS,
  PROJECT_ROLES,
  type ProjectRole,
} from "@/lib/project/roles";

import {
  addProjectMember,
  changeProjectMemberRole,
  removeProjectMember,
  type ActionResult,
} from "../actions";

type Member = {
  userId: string;
  role: ProjectRole;
  name: string | null;
  handle: string | null;
  avatar: string | null;
};

type Candidate = { userId: string; label: string };

const idle: FormState = { status: "idle" };

/**
 * The project's members. Leads and workspace admins add workspace members,
 * change roles and remove people; anyone can leave.
 */
export function ProjectMembers({
  projectId,
  workspaceId,
  projectsHref,
  currentUserId,
  canManage,
  candidates,
  members,
}: {
  projectId: string;
  workspaceId: string;
  projectsHref: string;
  currentUserId: string;
  canManage: boolean;
  candidates: Candidate[];
  members: Member[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const run = (
    action: () => Promise<ActionResult>,
    success: string,
    after?: () => void,
  ) => {
    setError(undefined);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        after?.();
      } else setError(result.message);
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
      {members.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Nobody is in this project yet.
        </p>
      ) : (
        <ul
          className="flex flex-col divide-y rounded-xl border"
          aria-busy={pending}
        >
          {members.map((member) => {
            const isSelf = member.userId === currentUserId;
            const label = member.name ?? member.handle ?? "Unnamed member";
            return (
              <li
                key={member.userId}
                className="flex flex-wrap items-center gap-3 p-3"
              >
                <ProfileAvatar
                  name={member.name}
                  src={member.avatar}
                  className="size-8 [&_[data-slot=avatar-fallback]]:text-xs"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
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
                {canManage ? (
                  <Select
                    value={member.role}
                    disabled={pending}
                    onValueChange={(role) =>
                      run(
                        () =>
                          changeProjectMemberRole({
                            projectId,
                            userId: member.userId,
                            role: role as ProjectRole,
                          }),
                        `${label} is now ${PROJECT_ROLE_LABELS[role as ProjectRole].toLowerCase()}`,
                      )
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-32"
                      aria-label={`Project role of ${label}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {PROJECT_ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary">
                    {PROJECT_ROLE_LABELS[member.role]}
                  </Badge>
                )}
                {isSelf ? (
                  <ConfirmButton
                    label="Leave"
                    accessibleLabel="Leave project"
                    title="Leave this project?"
                    description="If the project is private, you lose access to it right away."
                    confirmLabel="Leave project"
                    disabled={pending}
                    onConfirm={() =>
                      run(
                        () =>
                          removeProjectMember({
                            projectId,
                            userId: member.userId,
                          }),
                        "You left the project",
                        () => router.push(projectsHref),
                      )
                    }
                  />
                ) : (
                  canManage && (
                    <ConfirmButton
                      label="Remove"
                      accessibleLabel={`Remove ${label} from the project`}
                      title={`Remove ${label}?`}
                      description="They stay in the workspace but leave this project."
                      confirmLabel="Remove from project"
                      disabled={pending}
                      onConfirm={() =>
                        run(
                          () =>
                            removeProjectMember({
                              projectId,
                              userId: member.userId,
                            }),
                          `${label} was removed`,
                        )
                      }
                    />
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canManage && (
        <AddMemberForm
          projectId={projectId}
          workspaceId={workspaceId}
          candidates={candidates}
        />
      )}
    </section>
  );
}

function AddMemberForm({
  projectId,
  workspaceId,
  candidates,
}: {
  projectId: string;
  workspaceId: string;
  candidates: Candidate[];
}) {
  const [state, action] = useActionState(addProjectMember, idle);
  const errors = state.status === "error" ? state.fieldErrors : undefined;

  if (candidates.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Everyone in the workspace is in this project.
      </p>
    );
  }

  return (
    <form
      action={action}
      noValidate
      className="flex flex-col gap-3 rounded-xl border p-3"
    >
      <h3 className="text-sm font-medium">Add a member</h3>
      {state.status === "error" && state.message && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Could not add the member</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="add-member-user">Teammate</Label>
        <Select name="userId">
          <SelectTrigger
            id="add-member-user"
            className="w-full"
            aria-invalid={Boolean(errors?.userId) || undefined}
            aria-describedby={
              errors?.userId ? "add-member-user-error" : undefined
            }
          >
            <SelectValue placeholder="Choose a teammate" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((candidate) => (
              <SelectItem key={candidate.userId} value={candidate.userId}>
                {candidate.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="add-member-user-error" message={errors?.userId} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="add-member-role">Project role</Label>
        <Select name="role" defaultValue="contributor">
          <SelectTrigger id="add-member-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {PROJECT_ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SubmitButton pendingLabel="Adding…" variant="outline">
        Add to project
      </SubmitButton>
    </form>
  );
}
