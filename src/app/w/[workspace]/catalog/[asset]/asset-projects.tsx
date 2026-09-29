"use client";

import { CircleAlert, FolderKanban } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/confirm-button";
import { FieldError } from "@/components/form/field-error";
import { SubmitButton } from "@/components/form/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FormState } from "@/lib/forms";

import { linkAssetToProject, unlinkAssetFromProject } from "../actions";

export type LinkedProject = {
  id: string;
  name: string;
  href: string;
  /** Whether the viewer may unlink it (project lead/contributor). */
  canUnlink: boolean;
};

const idle: FormState = { status: "idle" };

/** The projects an asset is linked to; project editors link and unlink. */
export function AssetProjects({
  assetId,
  assetName,
  workspaceId,
  linked,
  linkable,
}: {
  assetId: string;
  assetName: string;
  workspaceId: string;
  linked: LinkedProject[];
  /** Projects the viewer edits that are not linked yet. */
  linkable: { id: string; name: string }[];
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const unlink = (project: LinkedProject) => {
    setError(undefined);
    startTransition(async () => {
      const result = await unlinkAssetFromProject({
        assetId,
        projectId: project.id,
      });
      if (result.ok) toast.success(`Unlinked from ${project.name}`);
      else setError(result.message);
    });
  };

  return (
    <section aria-labelledby="projects-heading" className="flex flex-col gap-3">
      <h2 id="projects-heading" className="text-sm font-semibold">
        Projects
      </h2>
      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertTitle>Could not unlink the project</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {linked.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Not linked to any project.
        </p>
      ) : (
        <ul
          className="flex flex-col divide-y rounded-xl border"
          aria-busy={pending}
        >
          {linked.map((project) => (
            <li key={project.id} className="flex items-center gap-2 p-2 pl-3">
              <FolderKanban
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
              />
              <Link
                href={project.href}
                className="min-w-0 flex-1 truncate rounded-sm text-sm underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {project.name}
              </Link>
              {project.canUnlink && (
                <ConfirmButton
                  label="Unlink"
                  accessibleLabel={`Unlink from ${project.name}`}
                  title={`Unlink from ${project.name}?`}
                  description={`${assetName} stays in the catalog; it just leaves this project.`}
                  confirmLabel="Unlink"
                  disabled={pending}
                  onConfirm={() => unlink(project)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {linkable.length > 0 && (
        <LinkForm
          // Remount (clearing the choice) once the list changes.
          key={linkable.map((p) => p.id).join()}
          assetId={assetId}
          workspaceId={workspaceId}
          projects={linkable}
        />
      )}
    </section>
  );
}

function LinkForm({
  assetId,
  workspaceId,
  projects,
}: {
  assetId: string;
  workspaceId: string;
  projects: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(linkAssetToProject, idle);
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const [projectId, setProjectId] = useState("");

  return (
    <form
      action={action}
      noValidate
      className="flex flex-col gap-2 rounded-xl border p-3"
    >
      {state.status === "error" && state.message && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Could not link the project</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <Label htmlFor="link-project">Link to a project</Label>
      <Select name="projectId" value={projectId} onValueChange={setProjectId}>
        <SelectTrigger
          id="link-project"
          className="w-full"
          aria-invalid={Boolean(errors?.projectId) || undefined}
          aria-describedby={
            errors?.projectId ? "link-project-error" : undefined
          }
        >
          <SelectValue placeholder="Choose a project" />
        </SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError id="link-project-error" message={errors?.projectId} />
      <SubmitButton pendingLabel="Linking…" variant="outline" size="sm">
        Link project
      </SubmitButton>
    </form>
  );
}
