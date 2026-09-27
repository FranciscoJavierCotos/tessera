import { createEnv } from "./lib/env/create-env";

export type { Env } from "./lib/env/create-env";

export const env = createEnv({
  // Each NEXT_PUBLIC_* var must be referenced literally so Next.js inlines it.
  runtimeEnv: {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
  isServer: typeof window === "undefined",
  skipValidation: ["1", "true"].includes(process.env.SKIP_ENV_VALIDATION ?? ""),
});
