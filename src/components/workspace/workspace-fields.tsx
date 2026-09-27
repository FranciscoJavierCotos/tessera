"use client";

import { useState } from "react";

import { FieldError } from "@/components/form/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldErrors } from "@/lib/forms";
import { slugify } from "@/lib/profile/schema";

/**
 * Name and URL inputs (`name`, `slug`) for creating a workspace. The URL
 * follows the name until the user edits it.
 */
export function WorkspaceFields({ errors }: { errors?: FieldErrors }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input
          id="workspace-name"
          name="name"
          maxLength={100}
          placeholder="Acme Data"
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugEdited) setSlug(slugify(event.target.value));
          }}
          aria-invalid={Boolean(errors?.name) || undefined}
          aria-describedby={errors?.name ? "name-error" : undefined}
        />
        <FieldError id="name-error" message={errors?.name} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="workspace-slug">URL</Label>
        <div className="flex items-center rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
          <span className="pl-3 text-sm text-muted-foreground" aria-hidden>
            /w/
          </span>
          <Input
            id="workspace-slug"
            name="slug"
            maxLength={40}
            placeholder="acme-data"
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
              errors?.slug ? "slug-error slug-hint" : "slug-hint"
            }
          />
        </div>
        <p id="slug-hint" className="text-xs text-muted-foreground">
          3–40 lowercase letters, numbers and dashes.
        </p>
        <FieldError id="slug-error" message={errors?.slug} />
      </div>
    </>
  );
}
