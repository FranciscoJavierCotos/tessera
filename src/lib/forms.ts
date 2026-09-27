import type { z } from "zod";

export type FieldErrors = Partial<Record<string, string>>;

/** Result of a Server Action bound to a form with `useActionState`. */
export type FormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; message?: string; fieldErrors?: FieldErrors };

/**
 * The first message per field, keyed by the issue path joined with dots
 * (`displayName`, `links.0.url`).
 */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "form";
    errors[key] ??= issue.message;
  }
  return errors;
}
