import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect } from "vitest";

import { env } from "@/env";
import type { Database } from "@/lib/db/types";

export type TypedClient = SupabaseClient<Database>;

export type Credentials = { email: string; password: string };

const statelessAuth = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
};

/**
 * Service-role client for fixtures only. **Bypasses RLS**: never use it to
 * assert access, only to arrange and clean up data.
 */
export function createAdminClient(): TypedClient {
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    statelessAuth,
  );
}

/** Client with the publishable key and no session (the `anon` role). */
export function asAnon(): TypedClient {
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    statelessAuth,
  );
}

/** Signs `user` in and returns a client whose queries run under RLS as them. */
export async function asUser(user: Credentials): Promise<TypedClient> {
  const client = asAnon();
  const { error } = await client.auth.signInWithPassword(user);
  if (error)
    throw new Error(`Sign-in failed for ${user.email}: ${error.message}`);
  return client;
}

type QueryResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

// 42501: insufficient_privilege (RLS `with check` failure or revoked grant).
// PGRST116: `.single()` matched no rows because RLS hid them.
const DENIED_CODES = new Set(["42501", "PGRST116"]);

/**
 * Asserts that RLS denied `query`: either a permission error, or zero rows
 * returned/affected. Writes must end with `.select()` so affected rows are
 * returned; otherwise a silent no-op would be indistinguishable from success.
 */
export async function expectDenied(query: PromiseLike<QueryResult>) {
  const { data, error } = await query;

  if (error) {
    expect(
      DENIED_CODES.has(error.code ?? ""),
      `expected a permission error, got ${error.code}: ${error.message}`,
    ).toBe(true);
    return;
  }

  if (data === null) {
    throw new Error(
      "expectDenied: the query returned no data and no error. " +
        "Add `.select()` to writes so affected rows can be checked.",
    );
  }
  expect(Array.isArray(data) ? data : [data]).toHaveLength(0);
}

/** Asserts that `query` succeeded and returns its rows. */
export async function expectRows<T>(
  query: PromiseLike<{ data: T[] | null; error: QueryResult["error"] }>,
): Promise<T[]> {
  const { data, error } = await query;
  expect(error).toBeNull();
  return data ?? [];
}
