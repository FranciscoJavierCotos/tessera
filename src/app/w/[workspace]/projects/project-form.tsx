"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { FieldError } from "@/components/form/field-error";
import { SubmitButton } from "@/components/form/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/forms";
import { slugify } from "@/lib/profile/schema";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  PROJECT_VISIBILITIES,
  VISIBILITY_DESCRIPTIONS,
  VISIBILITY_LABELS,
  type ProjectStatus,
  type ProjectVisibility,
} from "@/lib/project/roles";
import {
  MAX_PROJECT_DESCRIPTION,
  MAX_PROJECT_NAME,
} from "@/lib/project/schema";

import { createProject, updateProject } from "./actions";

const idle: FormState = { status: "idle" };

export type ProjectFormValues = {
  name: string;
  slug: string;
  description: string;
  status: ProjectStatus;
  visibility: ProjectVisibility;
};

const EMPTY: ProjectFormValues = {
  name: "",
  slug: "",
  description: "",
  status: "planning",
  visibility: "workspace",
};

/**
 * Creates a project, or edits one when `projectId` is set. The URL follows
 * the name until the user edits it (new projects only). Visibility is
 * read-only unless `canChangeVisibility` (leads and workspace admins).
 */
export function ProjectForm({
  workspace,
  projectId,
  initial = EMPTY,
  canChangeVisibility = true,
  cancelHref,
}: {
  workspace: { id: string; slug: string };
  projectId?: string;
  initial?: ProjectFormValues;
  canChangeVisibility?: boolean;
  cancelHref: string;
}) {
  const editing = Boolean(projectId);
  const [state, action] = useActionState(
    editing ? updateProject : createProject,
    idle,
  );
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [slugEdited, setSlugEdited] = useState(editing);
  const [description, setDescription] = useState(initial.description);
  const [status, setStatus] = useState(initial.status);
  const [visibility, setVisibility] = useState(initial.visibility);

  return (
    <form action={action} noValidate className="flex flex-col gap-6">
      {state.status === "error" && state.message && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>
            {editing
              ? "Could not save the project"
              : "Could not create the project"}
          </AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="workspaceId" value={workspace.id} />
      <input type="hidden" name="workspaceSlug" value={workspace.slug} />
      {projectId && <input type="hidden" name="projectId" value={projectId} />}

      <div className="flex flex-col gap-2">
        <Label htmlFor="project-name">Project name</Label>
        <Input
          id="project-name"
          name="name"
          maxLength={MAX_PROJECT_NAME}
          placeholder="Revenue dashboard revamp"
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugEdited) setSlug(slugify(event.target.value));
          }}
          aria-invalid={Boolean(errors?.name) || undefined}
          aria-describedby={errors?.name ? "project-name-error" : undefined}
        />
        <FieldError id="project-name-error" message={errors?.name} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="project-slug">URL</Label>
        <div className="flex items-center rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
          <span
            className="truncate pl-3 text-sm text-muted-foreground"
            aria-hidden
          >
            /projects/
          </span>
          <Input
            id="project-slug"
            name="slug"
            maxLength={40}
            placeholder="revenue-dashboard"
            required
            autoCapitalize="none"
            spellCheck={false}
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value.toLowerCase());
              setSlugEdited(true);
            }}
            className="border-0 bg-transparent pl-0.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
            aria-invalid={Boolean(errors?.slug) || undefined}
            aria-describedby={
              errors?.slug
                ? "project-slug-error project-slug-hint"
                : "project-slug-hint"
            }
          />
        </div>
        <p id="project-slug-hint" className="text-xs text-muted-foreground">
          3–40 lowercase letters, numbers and dashes.
        </p>
        <FieldError id="project-slug-error" message={errors?.slug} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="project-description">Description</Label>
        <Textarea
          id="project-description"
          name="description"
          rows={5}
          maxLength={MAX_PROJECT_DESCRIPTION}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What the project delivers, for whom, and by when."
          aria-invalid={Boolean(errors?.description) || undefined}
          aria-describedby={
            errors?.description ? "project-description-error" : undefined
          }
        />
        <FieldError
          id="project-description-error"
          message={errors?.description}
        />
      </div>

      <div className="flex flex-col gap-2 sm:w-48">
        <Label htmlFor="project-status">Status</Label>
        <Select
          name="status"
          value={status}
          onValueChange={(value) => setStatus(value as ProjectStatus)}
        >
          <SelectTrigger id="project-status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {PROJECT_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="project-status-error" message={errors?.status} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend
          id="project-visibility-label"
          className="mb-2 text-sm font-medium"
        >
          Who can see it
        </legend>
        {!canChangeVisibility && (
          <>
            <input type="hidden" name="visibility" value={initial.visibility} />
            <p
              id="project-visibility-hint"
              className="text-xs text-muted-foreground"
            >
              Only project leads and workspace admins can change this.
            </p>
          </>
        )}
        <RadioGroup
          name={canChangeVisibility ? "visibility" : undefined}
          value={visibility}
          onValueChange={(value) => setVisibility(value as ProjectVisibility)}
          disabled={!canChangeVisibility}
          aria-labelledby="project-visibility-label"
          aria-describedby={
            canChangeVisibility ? undefined : "project-visibility-hint"
          }
          className="grid gap-2 sm:grid-cols-2"
        >
          {PROJECT_VISIBILITIES.map((visibility) => {
            const id = `project-visibility-${visibility}`;
            return (
              <Label
                key={visibility}
                htmlFor={id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-data-checked:border-primary has-data-checked:bg-primary/5 has-data-disabled:cursor-not-allowed has-data-disabled:opacity-70"
              >
                <RadioGroupItem id={id} value={visibility} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    {VISIBILITY_LABELS[visibility]}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {VISIBILITY_DESCRIPTIONS[visibility]}
                  </span>
                </span>
              </Label>
            );
          })}
        </RadioGroup>
        <FieldError
          id="project-visibility-error"
          message={errors?.visibility}
        />
      </fieldset>

      <div className="flex justify-between gap-3">
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton pendingLabel={editing ? "Saving…" : "Creating…"}>
          {editing ? "Save changes" : "Create project"}
        </SubmitButton>
      </div>
    </form>
  );
}
