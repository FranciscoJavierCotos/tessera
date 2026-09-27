import { z } from "zod";

import { Constants, type Database } from "@/lib/db/types";

export type Discipline = Database["public"]["Enums"]["discipline"];

export const DISCIPLINES = Constants.public.Enums.discipline;

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  data_analyst: "Data analyst",
  data_scientist: "Data scientist",
  data_engineer: "Data engineer",
  analytics_engineer: "Analytics engineer",
  lead: "Lead",
};

export const DISCIPLINE_DESCRIPTIONS: Record<Discipline, string> = {
  data_analyst: "Dashboards, ad-hoc analysis, answering the business.",
  data_scientist: "Models, experiments, statistics.",
  data_engineer: "Pipelines, infrastructure, ingestion.",
  analytics_engineer: "dbt models, semantic layer, data quality.",
  lead: "Leads or manages a data team.",
};

// Mirrors the DB checks on `profiles` and `workspaces` (the DB is the gate).
export const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;
export const SLUG_PATTERN = /^[a-z0-9-]{3,40}$/;
/** Workspace slugs taken by static routes under `/w` (DB check too). */
export const RESERVED_SLUGS: readonly string[] = ["new"];
export const MAX_SKILLS = 20;
export const MAX_LINKS = 5;

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, { error: "Enter your name." })
  .max(100, { error: "Use at most 100 characters." });

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, { error: "Use at least 3 characters." })
  .max(30, { error: "Use at most 30 characters." })
  .regex(HANDLE_PATTERN, {
    error: "Use lowercase letters, numbers and underscores only.",
  });

export const disciplineSchema = z.enum(DISCIPLINES, {
  error: "Choose your discipline.",
});

export const identitySchema = z.object({
  displayName: displayNameSchema,
  handle: handleSchema,
  discipline: disciplineSchema,
});

export type Identity = z.infer<typeof identitySchema>;

export const workspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Name your workspace." })
    .max(100, { error: "Use at most 100 characters." }),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_PATTERN, {
      error: "Use 3–40 lowercase letters, numbers and dashes.",
    })
    .refine((slug) => !RESERVED_SLUGS.includes(slug), {
      error: "That URL is reserved. Try another.",
    }),
});

const skillSchema = z
  .string()
  .trim()
  .min(1)
  .max(40, { error: "Keep each skill under 40 characters." });

export const linkSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, { error: "Give the link a label." })
    .max(40, { error: "Use at most 40 characters." }),
  url: z
    .string()
    .trim()
    .max(500, { error: "Use at most 500 characters." })
    .pipe(
      z.url({
        protocol: /^https?$/,
        hostname: z.regexes.domain,
        error: "Enter a full http(s) URL.",
      }),
    ),
});

export type ProfileLink = z.infer<typeof linkSchema>;

export const profileEditSchema = z.object({
  displayName: displayNameSchema,
  discipline: disciplineSchema,
  bio: z
    .string()
    .trim()
    .max(2000, { error: "Keep your bio under 2000 characters." }),
  skills: z
    .array(skillSchema)
    .max(MAX_SKILLS, { error: `Add at most ${MAX_SKILLS} skills.` })
    .transform(dedupeSkills),
  links: z
    .array(linkSchema)
    .max(MAX_LINKS, { error: `Add at most ${MAX_LINKS} links.` }),
  avatarPath: z.string().min(1).max(300).nullable(),
});

export type ProfileEdit = z.infer<typeof profileEditSchema>;

/** Keeps the first spelling of each skill, compared case-insensitively. */
export function dedupeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  return skills.filter((skill) => {
    const key = skill.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Parses `profiles.links` (jsonb), dropping entries that are not valid links. */
export function parseLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const link = linkSchema.safeParse(item);
    return link.success ? [link.data] : [];
  });
}

function asciiFold(value: string) {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** A handle suggestion from a display name: `Ada Lovelace` → `ada_lovelace`. */
export function suggestHandle(displayName: string): string {
  return asciiFold(displayName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30)
    .replace(/_+$/, "");
}

/** A workspace slug from its name: `Acme Data` → `acme-data`. */
export function slugify(name: string): string {
  return asciiFold(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/** `true` when `path` is a storage object path inside `userId`'s folder. */
export function isOwnAvatarPath(path: string, userId: string): boolean {
  const prefix = `${userId}/`;
  return (
    path.startsWith(prefix) &&
    path.length > prefix.length &&
    !path.slice(prefix.length).includes("/") &&
    !path.includes("..")
  );
}

// Mirrors the `avatars` bucket limits (the bucket enforces them).
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

/** Why `file` cannot be an avatar, or `null` when it can. */
export function avatarFileError(file: { type: string; size: number }) {
  if (!(file.type in AVATAR_TYPES))
    return "Use a PNG, JPEG, WebP or GIF image.";
  if (file.size > AVATAR_MAX_BYTES) return "Use an image under 2 MB.";
  return null;
}

/** Storage path for a new avatar upload: `<userId>/<random>.<ext>`. */
export function newAvatarPath(userId: string, type: string, id: string) {
  const ext = AVATAR_TYPES[type as keyof typeof AVATAR_TYPES] ?? "img";
  return `${userId}/${id}.${ext}`;
}
