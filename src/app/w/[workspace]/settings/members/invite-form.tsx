"use client";

import { Check, CircleAlert, Copy, MailCheck } from "lucide-react";
import { useActionState, useState } from "react";

import { FieldError } from "@/components/form/field-error";
import { SubmitButton } from "@/components/form/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, type WorkspaceRole } from "@/lib/workspace/roles";

import { inviteMember, type InviteFormState } from "./actions";

const idle: InviteFormState = { status: "idle" };

export function InviteForm({
  workspaceId,
  roles,
}: {
  workspaceId: string;
  roles: WorkspaceRole[];
}) {
  const [state, action] = useActionState(inviteMember, idle);
  const errors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <section aria-labelledby="invite-heading" className="flex flex-col gap-3">
      <h2 id="invite-heading" className="text-base font-semibold">
        Invite people
      </h2>
      {state.status === "error" && state.message && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Could not send the invite</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.status === "invited" && (
        <InviteSent email={state.email} link={state.link} />
      )}
      <form
        // A new form after each invite clears the email field.
        key={state.status === "invited" ? state.link : "invite"}
        action={action}
        noValidate
        className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start"
      >
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            autoComplete="off"
            placeholder="teammate@company.com"
            required
            maxLength={320}
            aria-invalid={Boolean(errors?.email) || undefined}
            aria-describedby={errors?.email ? "invite-email-error" : undefined}
          />
          <FieldError id="invite-email-error" message={errors?.email} />
        </div>
        <div className="flex flex-col gap-2 sm:w-36">
          <Label htmlFor="invite-role">Role</Label>
          <Select name="role" defaultValue="member">
            <SelectTrigger id="invite-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="invite-role-error" message={errors?.role} />
        </div>
        <SubmitButton pendingLabel="Inviting…" className="sm:mt-5.5">
          Send invite
        </SubmitButton>
      </form>
    </section>
  );
}

/** Shows the accept link once; only its hash is stored. */
function InviteSent({ email, link }: { email: string; link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert>
      <MailCheck aria-hidden />
      <AlertTitle>Invite sent to {email}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>
          You can also share this link with them. It works once, for that email
          only, and expires in 7 days. It will not be shown again.
        </span>
        <span className="flex items-center gap-2">
          <Input
            readOnly
            value={link}
            aria-label="Invite link"
            className="font-mono text-xs"
            onFocus={(event) => event.target.select()}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
