/** App areas that require a session (`/w/*`, `/u/*`, `/onboarding`). */
const PROTECTED_PREFIXES = ["/w", "/u", "/onboarding"];

/** Pages a signed-in user has no reason to see. */
const GUEST_ONLY_PATHS = ["/sign-in"];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isGuestOnlyPath(pathname: string): boolean {
  return GUEST_ONLY_PATHS.includes(pathname);
}
