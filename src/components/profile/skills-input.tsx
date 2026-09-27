"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { dedupeSkills, MAX_SKILLS } from "@/lib/profile/schema";

/**
 * Tag input: Enter or a comma adds a skill, Backspace on an empty field
 * removes the last one. Each skill submits as a `name` hidden input.
 */
export function SkillsInput({
  id,
  name = "skills",
  defaultValue = [],
  describedBy,
}: {
  id: string;
  name?: string;
  defaultValue?: string[];
  describedBy?: string;
}) {
  const [skills, setSkills] = useState(defaultValue);
  const [draft, setDraft] = useState("");
  const full = skills.length >= MAX_SKILLS;

  function add(values: string[]) {
    const added = values.map((v) => v.trim().slice(0, 40)).filter(Boolean);
    if (added.length) {
      setSkills((current) =>
        dedupeSkills([...current, ...added]).slice(0, MAX_SKILLS),
      );
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {skills.map((skill) => (
        <input key={skill} type="hidden" name={name} value={skill} />
      ))}
      {skills.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Your skills">
          {skills.map((skill) => (
            <li key={skill}>
              <Badge variant="secondary" className="h-6 gap-1 pr-1">
                {skill}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={`Remove ${skill}`}
                  onClick={() =>
                    setSkills((current) => current.filter((s) => s !== skill))
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
        placeholder={full ? `Up to ${MAX_SKILLS} skills` : "dbt, SQL, Airflow…"}
        aria-describedby={describedBy}
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
          } else if (event.key === "Backspace" && !draft && skills.length) {
            setSkills((current) => current.slice(0, -1));
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
