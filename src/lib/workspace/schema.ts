import { z } from "zod";

import { WORKSPACE_ROLES } from "./roles";

export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES, {
  error: "Choose a role.",
});

export const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(320, { error: "Use at most 320 characters." })
    .pipe(z.email({ error: "Enter a valid email address." })),
  role: workspaceRoleSchema,
});

export type InviteInput = z.infer<typeof inviteSchema>;

export const changeRoleSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.uuid(),
  role: workspaceRoleSchema,
});

export const memberRefSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.uuid(),
});

export const inviteRefSchema = z.object({
  workspaceId: z.uuid(),
  inviteId: z.uuid(),
});
