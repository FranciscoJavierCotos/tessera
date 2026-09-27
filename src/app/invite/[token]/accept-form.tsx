"use client";

import { CircleAlert } from "lucide-react";
import { useActionState } from "react";

import { SubmitButton } from "@/components/form/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { FormState } from "@/lib/forms";

import { acceptInvite } from "./actions";

const idle: FormState = { status: "idle" };

export function AcceptInviteForm({
  token,
  workspaceName,
}: {
  token: string;
  workspaceName: string;
}) {
  const [state, action] = useActionState(acceptInvite, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state.status === "error" && state.message && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Could not join</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <SubmitButton pendingLabel="Joining…">Join {workspaceName}</SubmitButton>
    </form>
  );
}
