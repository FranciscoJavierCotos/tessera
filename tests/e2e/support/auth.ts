import { randomBytes } from "node:crypto";

import { test as base, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { env } from "@/env";
import type { Database } from "@/lib/db/types";

export type TestUser = {
  id: string;
  email: string;
  password: string;
  /** Set for onboarded users. */
  handle: string | null;
  displayName: string;
};

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Service-role client for arranging auth fixtures. **Bypasses RLS**; never
 * use it to assert access.
 */
export function createAdminClient() {
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function uniqueId() {
  return `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

async function createUser(
  admin: Admin,
  { onboarded }: { onboarded: boolean },
): Promise<TestUser> {
  const id = uniqueId();
  const email = `e2e+auth-${id}@tessera.test`;
  const displayName = `E2E ${id}`;
  const password = `pw-${randomBytes(12).toString("hex")}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);

  let handle: string | null = null;
  if (onboarded) {
    handle = `e2e_${id}`;
    const profile = await admin
      .from("profiles")
      .update({
        handle,
        discipline: "data_engineer",
        onboarded_at: new Date().toISOString(),
      })
      .eq("id", data.user.id);
    if (profile.error) throw new Error(`onboard: ${profile.error.message}`);
  }
  return { id: data.user.id, email, password, handle, displayName };
}

/** Deletes what the user created (workspaces, avatars), then the user. */
async function deleteUser(admin: Admin, userId: string) {
  const { data: files } = await admin.storage.from("avatars").list(userId);
  if (files?.length) {
    await admin.storage
      .from("avatars")
      .remove(files.map((f) => `${userId}/${f.name}`));
  }
  await admin.from("workspaces").delete().eq("created_by", userId);
  const deleted = await admin.auth.admin.deleteUser(userId);
  if (deleted.error) throw new Error(`deleteUser: ${deleted.error.message}`);
}

/**
 * Playwright fixtures:
 * - `user`: an onboarded user (handle, discipline) created through the Admin
 *   API, deleted after the test.
 * - `newUser`: a user who has not onboarded yet.
 * - `createUser(opts)`: more users for multi-user tests, deleted afterwards.
 * - `signIn(user, next, page)`: signs the user in through the `/sign-in`
 *   password form (on the test's `page` by default) and waits to leave it.
 * - `admin`: the service-role client for arranging data.
 */
export const test = base.extend<{
  admin: Admin;
  user: TestUser;
  newUser: TestUser;
  createUser: (opts: { onboarded: boolean }) => Promise<TestUser>;
  signIn: (user: TestUser, next?: string, onPage?: Page) => Promise<void>;
}>({
  admin: async ({}, provide) => {
    await provide(createAdminClient());
  },

  createUser: async ({ admin }, provide) => {
    const created: string[] = [];
    await provide(async (opts) => {
      const user = await createUser(admin, opts);
      created.push(user.id);
      return user;
    });
    for (const id of created) await deleteUser(admin, id);
  },

  user: async ({ createUser }, provide) => {
    await provide(await createUser({ onboarded: true }));
  },

  newUser: async ({ createUser }, provide) => {
    await provide(await createUser({ onboarded: false }));
  },

  signIn: async ({ page }, provide) => {
    await provide(async (user, next = "/w", onPage = page) => {
      await onPage.goto(`/sign-in?${new URLSearchParams({ next })}`);
      await onPage.getByLabel("Work email").fill(user.email);
      await onPage.getByLabel("Password").fill(user.password);
      await onPage
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await onPage.waitForURL((url) => url.pathname !== "/sign-in");
    });
  },
});

export { expect } from "@playwright/test";
