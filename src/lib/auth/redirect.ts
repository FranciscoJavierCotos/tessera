/** Where a signed-in user lands when no (valid) `next` is given. */
export const DEFAULT_NEXT_PATH = "/w";

// Any origin works: it only has to be one an attacker cannot name.
const PROBE_ORIGIN = "http://tessera.invalid";

/**
 * Returns `next` if it is a same-origin relative path, otherwise
 * `DEFAULT_NEXT_PATH`. Guards every `?next=` redirect against open redirects:
 * rejects absolute URLs, protocol-relative `//host`, backslash tricks
 * (`/\host`), and control characters browsers strip before resolving.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/")) {
    return DEFAULT_NEXT_PATH;
  }
  if (next.includes("\\") || /[\u0000-\u001f\u007f]/.test(next)) {
    return DEFAULT_NEXT_PATH;
  }

  let url: URL;
  try {
    url = new URL(next, PROBE_ORIGIN);
  } catch {
    return DEFAULT_NEXT_PATH;
  }
  if (url.origin !== PROBE_ORIGIN) return DEFAULT_NEXT_PATH;

  return `${url.pathname}${url.search}${url.hash}`;
}

/** The sign-in URL that returns the user to `path` afterwards. */
export function signInPath(path: string): string {
  const next = safeNextPath(path);
  return next === DEFAULT_NEXT_PATH
    ? "/sign-in"
    : `/sign-in?next=${encodeURIComponent(next)}`;
}

/** The onboarding URL that continues to `path` once the user is done. */
export function onboardingPath(path: string): string {
  const next = safeNextPath(path);
  return next === DEFAULT_NEXT_PATH
    ? "/onboarding"
    : `/onboarding?next=${encodeURIComponent(next)}`;
}
