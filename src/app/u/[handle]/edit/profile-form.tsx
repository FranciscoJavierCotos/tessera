"use client";

import { CircleAlert, Loader2, Plus, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import { FieldError } from "@/components/form/field-error";
import { AvatarField } from "@/components/profile/avatar-field";
import { DisciplinePicker } from "@/components/profile/discipline-picker";
import { SkillsInput } from "@/components/profile/skills-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/forms";
import {
  MAX_LINKS,
  type Discipline,
  type ProfileLink,
} from "@/lib/profile/schema";

import { updateProfile } from "./actions";

const idle: FormState = { status: "idle" };

type LinkRow = ProfileLink & { key: number };

export function ProfileForm({
  userId,
  handle,
  initial,
}: {
  userId: string;
  handle: string;
  initial: {
    displayName: string;
    discipline: Discipline | null;
    bio: string;
    skills: string[];
    links: ProfileLink[];
    avatarPath: string | null;
    avatarUrl: string | null;
  };
}) {
  const [state, action, pending] = useActionState(updateProfile, idle);
  const [, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [links, setLinks] = useState<LinkRow[]>(() =>
    initial.links.map((link, key) => ({ ...link, key })),
  );
  const [nextKey, setNextKey] = useState(initial.links.length);
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const err = (field: string) => errors?.[field];
  const invalid = (field: string) => Boolean(err(field)) || undefined;

  return (
    <form
      className="flex flex-col gap-8"
      noValidate
      // Submit through a transition instead of `action={…}`: React resets
      // uncontrolled fields after a form action, which would wipe the user's
      // edits whenever validation fails.
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
      aria-busy={pending}
    >
      {state.status === "error" && state.message && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Your profile was not saved</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Photo</legend>
        <AvatarField
          userId={userId}
          name={displayName}
          defaultPath={initial.avatarPath}
          defaultUrl={initial.avatarUrl}
          serverError={err("avatarPath")}
        />
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          autoComplete="name"
          maxLength={100}
          required
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          aria-invalid={invalid("displayName")}
          aria-describedby="displayName-error"
        />
        <FieldError id="displayName-error" message={err("displayName")} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="handle">Handle</Label>
        <Input id="handle" value={`@${handle}`} readOnly disabled />
      </div>

      <div className="flex flex-col gap-2">
        <p id="discipline-label" className="text-sm font-medium">
          Discipline
        </p>
        <DisciplinePicker
          defaultValue={initial.discipline}
          labelledBy="discipline-label"
          describedBy="discipline-error"
          invalid={invalid("discipline")}
        />
        <FieldError id="discipline-error" message={err("discipline")} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          name="bio"
          rows={4}
          maxLength={2000}
          defaultValue={initial.bio}
          placeholder="What you work on, what people can ask you about."
          aria-invalid={invalid("bio")}
          aria-describedby="bio-error"
        />
        <FieldError id="bio-error" message={err("bio")} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="skills">Skills</Label>
        <SkillsInput
          id="skills"
          defaultValue={initial.skills}
          describedBy="skills-hint skills-error"
        />
        <p id="skills-hint" className="text-xs text-muted-foreground">
          Press Enter or type a comma to add a skill.
        </p>
        <FieldError id="skills-error" message={err("skills")} />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Links</legend>
        {links.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Add your GitHub, blog or anything your team should see.
          </p>
        )}
        {links.map((link, index) => (
          <div key={link.key} className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <Input
                name="linkLabel"
                aria-label={`Link ${index + 1} label`}
                placeholder="GitHub"
                maxLength={40}
                defaultValue={link.label}
                className="w-32 shrink-0"
                aria-invalid={invalid(`links.${index}.label`)}
              />
              <Input
                name="linkUrl"
                type="url"
                aria-label={`Link ${index + 1} URL`}
                placeholder="https://github.com/you"
                maxLength={500}
                defaultValue={link.url}
                aria-invalid={invalid(`links.${index}.url`)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove link ${index + 1}`}
                onClick={() =>
                  setLinks((rows) => rows.filter((row) => row.key !== link.key))
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
            <FieldError
              id={`link-${index}-error`}
              message={err(`links.${index}.label`) ?? err(`links.${index}.url`)}
            />
          </div>
        ))}
        <FieldError id="links-error" message={err("links")} />
        {links.length < MAX_LINKS && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => {
              setLinks((rows) => [
                ...rows,
                { label: "", url: "", key: nextKey },
              ]);
              setNextKey((key) => key + 1);
            }}
          >
            <Plus aria-hidden />
            Add link
          </Button>
        )}
      </fieldset>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 aria-hidden className="animate-spin" />}
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
