import { RESERVED_SLUGS, SLUG_PATTERN } from "@/lib/profile/schema";

/** Remembers the last workspace a user opened; `/w` redirects to it. */
export const LAST_WORKSPACE_COOKIE = "tessera-last-workspace";

export const LAST_WORKSPACE_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 365,
} as const;

/**
 * The workspace slug in `/w/<slug>` or `/w/<slug>/…`, or `null`. Membership
 * is not checked here: `/w` only follows the cookie to a workspace the user
 * still belongs to.
 */
export function workspaceSlugFromPath(pathname: string): string | null {
  const match = /^\/w\/([^/]+)(?:\/|$)/.exec(pathname);
  const slug = match?.[1]?.toLowerCase();
  if (!slug || !SLUG_PATTERN.test(slug) || RESERVED_SLUGS.includes(slug)) {
    return null;
  }
  return slug;
}
