import { z } from "zod";

/** Supabase hashes passwords with bcrypt, which only reads the first 72 bytes. */
export const PASSWORD_MAX_LENGTH = 72;
export const PASSWORD_MIN_LENGTH = 8;

export const authModes = ["sign-in", "sign-up"] as const;
export type AuthMode = (typeof authModes)[number];

const email = z
  .string()
  .trim()
  .pipe(z.email({ error: "Enter a valid email address." }));

/**
 * Credentials posted by the sign-in form. Signing in only checks that a
 * password was typed (the account may predate the length rule); creating an
 * account enforces the length rule.
 */
export const credentialsInput = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("sign-in"),
    email,
    password: z
      .string()
      .min(1, { error: "Enter your password." })
      .max(PASSWORD_MAX_LENGTH, {
        error: `Passwords are at most ${PASSWORD_MAX_LENGTH} characters.`,
      }),
    next: z.string().optional(),
  }),
  z.object({
    mode: z.literal("sign-up"),
    email,
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, {
        error: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
      })
      .max(PASSWORD_MAX_LENGTH, {
        error: `Passwords are at most ${PASSWORD_MAX_LENGTH} characters.`,
      }),
    next: z.string().optional(),
  }),
]);

export type Credentials = z.infer<typeof credentialsInput>;
