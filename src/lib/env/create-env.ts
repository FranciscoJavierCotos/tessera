import { z } from "zod";

/** Server-only variables. Never read these from client code. */
export const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

/** Public variables, inlined into the browser bundle (`NEXT_PUBLIC_*`). */
export const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url(),
});

export type Env = z.infer<typeof serverSchema> & z.infer<typeof clientSchema>;
type RuntimeEnv = Record<keyof Env, string | undefined>;

export class EnvValidationError extends Error {
  override name = "EnvValidationError";
}

/**
 * Validates `runtimeEnv` and returns a typed env object. On the client only the
 * `NEXT_PUBLIC_*` variables are validated, and reading a server variable throws.
 * Empty strings count as missing.
 */
export function createEnv(options: {
  runtimeEnv: RuntimeEnv;
  isServer: boolean;
  skipValidation?: boolean;
}): Env {
  const { runtimeEnv, isServer, skipValidation = false } = options;
  if (skipValidation) return runtimeEnv as Env;

  const source = Object.fromEntries(
    Object.entries(runtimeEnv).map(([key, value]) => [
      key,
      value === "" ? undefined : value,
    ]),
  );
  const schema = isServer
    ? serverSchema.extend(clientSchema.shape)
    : clientSchema;
  const result = schema.safeParse(source);

  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const key = issue.path.join(".");
      return `  - ${key}: ${source[key] === undefined ? "missing" : issue.message}`;
    });
    throw new EnvValidationError(
      [
        "Invalid environment variables:",
        ...problems,
        "Copy .env.example to .env.local and fill in the values.",
      ].join("\n"),
    );
  }

  return new Proxy(result.data as Env, {
    get(target, prop) {
      if (!isServer && typeof prop === "string" && prop in serverSchema.shape) {
        throw new Error(
          `Server-only env var "${prop}" was read on the client.`,
        );
      }
      return Reflect.get(target, prop);
    },
  });
}
