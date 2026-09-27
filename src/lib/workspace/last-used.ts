/** Remembers the last workspace a user opened; `/w` redirects to it. */
export const LAST_WORKSPACE_COOKIE = "tessera-last-workspace";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * The `document.cookie` assignment that remembers `slug`. Not sensitive (a
 * slug the user can open anyway): `/w` only follows it to a workspace the
 * user still belongs to.
 */
export function lastWorkspaceCookie(slug: string, secure: boolean): string {
  return [
    `${LAST_WORKSPACE_COOKIE}=${encodeURIComponent(slug)}`,
    "path=/",
    `max-age=${ONE_YEAR_SECONDS}`,
    "samesite=lax",
    ...(secure ? ["secure"] : []),
  ].join("; ");
}
