import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";

import { env } from "@/env";
import type { Database } from "@/lib/db/types";

/**
 * Supabase client for Client Components (Realtime, client-side reads). Uses
 * the publishable key and the session cookies, so every query runs under RLS.
 * `@supabase/ssr` returns a singleton in the browser.
 */
export function createBrowserClient() {
  return createSsrBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
