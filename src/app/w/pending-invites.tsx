"use client";

import { CircleAlert } from "lucide-react";
import { useActionState } from "react";

import { SubmitButton } from "@/components/form/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { FormState } from "@/lib/forms";
import { ROLE_LABELS, type WorkspaceRole } from "@/lib/workspace/roles";

import { joinPendingInvite } from "./actions";

type Invite = {
  id: string;
  workspaceName: string;
  role: WorkspaceRole;
  invitedBy: string | null;
};

const idle: FormState = { status: "idle" };

/** Invites for the user's email to workspaces they are not in yet. */
export function PendingInvites({ invites }: { invites: Invite[] }) {
  const [state, action] = useActionState(joinPendingInvite, idle);

  return (
    <section aria-labelledby="pending-invites" className="flex flex-col gap-3">
      <h2 id="pending-invites" className="text-sm font-medium">
        Pending invites
      </h2>
      {state.status === "error" && state.message && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Could not join</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <ul className="flex flex-col gap-2">
        {invites.map((invite) => (
          <li key={invite.id}>
            <form
              action={action}
              className="flex items-center justify-between gap-3 rounded-xl border p-4"
            >
              <input type="hidden" name="inviteId" value={invite.id} />
              <span className="flex flex-col text-sm">
                <span className="font-medium">{invite.workspaceName}</span>
                <span className="text-muted-foreground">
                  As {ROLE_LABELS[invite.role].toLowerCase()}
                  {invite.invitedBy ? ` · invited by ${invite.invitedBy}` : ""}
                </span>
              </span>
              <SubmitButton
                size="sm"
                pendingLabel="Joining…"
                aria-label={`Join ${invite.workspaceName}`}
              >
                Join
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
