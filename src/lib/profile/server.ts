import "server-only";

import { redirect } from "next/navigation";

import { createServerClient } from "@/lib/supabase/server";

export type ServerClient = Awaited<ReturnType<typeof createServerClient>>;

/**
 * The signed-in user's id and email plus a user-scoped client. Redirects to
 * `/sign-in` when there is no session (the proxy normally catches this first).
 */
export async function requireUser() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data) redirect("/sign-in");
  return {
    supabase,
    userId: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
}

const AVATAR_URL_TTL_SECONDS = 60 * 60;

/** A short-lived signed URL for a private `avatars` object, or `null`. */
export async function avatarUrl(
  supabase: ServerClient,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, AVATAR_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

// Postgres error codes the profile flows map to field errors.
export const UNIQUE_VIOLATION = "23505";
