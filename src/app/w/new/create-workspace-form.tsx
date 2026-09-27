"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { SubmitButton } from "@/components/form/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WorkspaceFields } from "@/components/workspace/workspace-fields";
import type { FormState } from "@/lib/forms";

import { createWorkspace } from "../actions";

const idle: FormState = { status: "idle" };

export function CreateWorkspaceForm() {
  const [state, action] = useActionState(createWorkspace, idle);
  const errors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === "error" && state.message && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Could not create the workspace</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <WorkspaceFields errors={errors} />
      <div className="flex justify-between gap-3">
        <Button asChild variant="ghost">
          <Link href="/w?all=1">Cancel</Link>
        </Button>
        <SubmitButton pendingLabel="Creating…">Create workspace</SubmitButton>
      </div>
    </form>
  );
}
