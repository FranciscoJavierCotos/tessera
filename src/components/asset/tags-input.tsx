"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MAX_TAGS, normalizeTags } from "@/lib/asset/schema";

/**
 * Tag input: Enter or a comma adds a tag (lowercased), Backspace on an empty
 * field removes the last one. Each tag submits as a `name` hidden input.
 */
export function TagsInput({
  id,
  name = "tags",
  defaultValue = [],
  describedBy,
  invalid,
}: {
  id: string;
  name?: string;
  defaultValue?: string[];
  describedBy?: string;
  invalid?: boolean;
}) {
  const [tags, setTags] = useState(defaultValue);
  const [draft, setDraft] = useState("");
  const full = tags.length >= MAX_TAGS;

  function add(values: string[]) {
    const added = values.map((v) => v.replace(/^#/, "").slice(0, 32));
    setTags((current) =>
      normalizeTags([...current, ...added]).slice(0, MAX_TAGS),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {tags.map((tag) => (
        <input key={tag} type="hidden" name={name} value={tag} />
      ))}
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {tags.map((tag) => (
            <li key={tag}>
              <Badge variant="secondary" className="h-6 gap-1 pr-1">
                #{tag}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() =>
                    setTags((current) => current.filter((t) => t !== tag))
                  }
                >
                  <X aria-hidden className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={draft}
        disabled={full}
        placeholder={full ? `Up to ${MAX_TAGS} tags` : "finance, core, pii…"}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          const parts = event.target.value.split(",");
          add(parts.slice(0, -1));
          setDraft(parts.at(-1) ?? "");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add([draft]);
            setDraft("");
          } else if (event.key === "Backspace" && !draft && tags.length) {
            setTags((current) => current.slice(0, -1));
          }
        }}
        onBlur={() => {
          add([draft]);
          setDraft("");
        }}
      />
    </div>
  );
}
