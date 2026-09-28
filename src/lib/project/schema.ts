import { z } from "zod";

import { RESERVED_SLUGS, SLUG_PATTERN } from "@/lib/profile/schema";

import {
  PROJECT_ROLES,
  PROJECT_STATUSES,
  PROJECT_VISIBILITIES,
  type ProjectStatus,
} from "./roles";

// Mirrors the DB checks on `projects` and `entities` (the DB is the gate).
export const MAX_PROJECT_NAME = 100;
export const MAX_PROJECT_DESCRIPTION = 5000;

export const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Name your project." })
    .max(MAX_PROJECT_NAME, {
      error: `Use at most ${MAX_PROJECT_NAME} characters.`,
    }),
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
  description: z
    .string()
    .trim()
    .max(MAX_PROJECT_DESCRIPTION, {
      error: `Use at most ${MAX_PROJECT_DESCRIPTION} characters.`,
    }),
  status: z.enum(PROJECT_STATUSES, { error: "Choose a status." }),
  visibility: z.enum(PROJECT_VISIBILITIES, { error: "Choose who can see it." }),
});

export type ProjectInput = z.infer<typeof projectSchema>;

export const projectRoleSchema = z.enum(PROJECT_ROLES, {
  error: "Choose a role.",
});

export const addProjectMemberSchema = z.object({
  projectId: z.uuid(),
  workspaceId: z.uuid(),
  userId: z.uuid({ error: "Choose a teammate." }),
  role: projectRoleSchema,
});

export const changeProjectRoleSchema = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
  role: projectRoleSchema,
});

export const projectMemberRefSchema = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
});

export const archiveProjectSchema = z.object({
  projectId: z.uuid(),
  archived: z.boolean(),
});

/** The projects list filter: a status, archived projects, or everything open. */
export type ProjectFilter = "all" | ProjectStatus | "archived";

export const PROJECT_FILTERS: readonly ProjectFilter[] = [
  "all",
  ...PROJECT_STATUSES,
  "archived",
];

/** `?status=` as a filter; anything unknown means `all`. */
export function parseProjectFilter(
  value: string | string[] | undefined,
): ProjectFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return PROJECT_FILTERS.find((f) => f === raw) ?? "all";
}
