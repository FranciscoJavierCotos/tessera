import { randomBytes } from "node:crypto";

import { test as base } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { env } from "@/env";

export type TestUser = { id: string; email: string };

/**
 * Service-role client for arranging auth fixtures. **Bypasses RLS**; never
 * use it to assert access.
 */
function createAdminClient() {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Playwright fixtures:
 * - `user`: a confirmed user created through the Admin API, deleted after the test.
 * - `magicLinkPath(email, next)`: the `/auth/callback` path that signs the user
 *   in, built from `auth.admin.generateLink` (no email is sent).
 */
export const test = base.extend<{
  user: TestUser;
  magicLinkPath: (email: string, next?: string) => Promise<string>;
}>({
  user: async ({}, provide) => {
    const admin = createAdminClient();
    const email = `e2e+auth-${Date.now().toString(36)}${randomBytes(3).toString("hex")}@tessera.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { display_name: "E2E Auth" },
    });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);

    await provide({ id: data.user.id, email });

    const deleted = await admin.auth.admin.deleteUser(data.user.id);
    if (deleted.error) throw new Error(`deleteUser: ${deleted.error.message}`);
  },

  magicLinkPath: async ({}, provide) => {
    const admin = createAdminClient();
    await provide(async (email, next = "/w") => {
      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (error) throw new Error(`generateLink ${email}: ${error.message}`);
      const params = new URLSearchParams({
        token_hash: data.properties.hashed_token,
        type: "magiclink",
        next,
      });
      return `/auth/callback?${params}`;
    });
  },
});

export { expect } from "@playwright/test";
