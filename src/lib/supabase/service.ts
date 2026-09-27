import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/env";
import type { Database } from "@/lib/db/types";

/**
 * Service-role client. **Bypasses RLS.** Server-only (`server-only` makes any
 * client import fail the build).
 *
 * Never use it directly from app code: wrap it in a helper that scopes every
 * query by `workspace_id` (public API, admin scripts, test fixtures).
 */
export function createServiceClient() {
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
