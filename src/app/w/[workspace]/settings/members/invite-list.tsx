"use client";

import { CircleAlert, Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type WorkspaceRole } from "@/lib/workspace/roles";

import { revokeInvite } from "./actions";
import { ConfirmButton } from "@/components/confirm-button";

type Invite = {
  id: string;
  email: string;
  role: WorkspaceRole;
  expires: string;
  expired: boolean;
};

/** Invites that have not been accepted yet (owners and admins only). */
export function InviteList({
  workspaceId,
  invites,
}: {
  workspaceId: string;
  invites: Invite[];
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <section aria-labelledby="invites-heading" className="flex flex-col gap-3">
      <h2 id="invites-heading" className="text-base font-semibold">
        Pending invites
      </h2>
      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertTitle>Could not revoke the invite</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {invites.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          <Mail aria-hidden className="size-5" />
          <p>No pending invites.</p>
        </div>
      ) : (
        <ul
          className="flex flex-col divide-y rounded-xl border"
          aria-busy={pending}
        >
          {invites.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {invite.email}
                </span>
                <span className="text-xs text-muted-foreground">
                  {invite.expired
                    ? `Expired ${invite.expires}`
                    : `Expires ${invite.expires}`}
                </span>
              </div>
              {invite.expired && <Badge variant="outline">Expired</Badge>}
              <Badge variant="secondary">{ROLE_LABELS[invite.role]}</Badge>
              <div className="w-20 text-right">
                <ConfirmButton
                  label="Revoke"
                  accessibleLabel={`Revoke invite for ${invite.email}`}
                  title={`Revoke the invite for ${invite.email}?`}
                  description="The invite link stops working. You can invite them again later."
                  confirmLabel="Revoke invite"
                  disabled={pending}
                  onConfirm={() => {
                    setError(undefined);
                    startTransition(async () => {
                      const result = await revokeInvite({
                        workspaceId,
                        inviteId: invite.id,
                      });
                      if (result.ok) {
                        toast.success(`Invite for ${invite.email} revoked`);
                      } else {
                        setError(result.message);
                      }
                    });
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
