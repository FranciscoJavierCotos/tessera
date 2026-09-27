import "server-only";

import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/env";
import type { Database } from "@/lib/db/types";

import { createCookieMethods } from "./cookies";

/**
 * User-scoped Supabase client for Server Components, Server Actions and Route
 * Handlers. Uses the publishable key plus the user's session cookies, so every
 * query runs under RLS. Create one per request; never share it.
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createSsrServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { cookies: createCookieMethods(cookieStore) },
  );
}
