import type { NextRequest } from "next/server";

import {
  DEFAULT_NEXT_PATH,
  onboardingPath,
  safeNextPath,
  signInPath,
} from "@/lib/auth/redirect";
import {
  isGuestOnlyPath,
  isOnboardingPath,
  isProtectedPath,
} from "@/lib/auth/routes";
import {
  isOnboarded,
  redirectWithCookies,
  updateSession,
} from "@/lib/supabase/proxy";
import {
  LAST_WORKSPACE_COOKIE,
  LAST_WORKSPACE_COOKIE_OPTIONS,
  workspaceSlugFromPath,
} from "@/lib/workspace/last-used";

/**
 * Runs before every page request: refreshes the Supabase session cookies and
 * gates routes.
 *
 * - Signed-out visitors of `/w/*`, `/u/*`, `/invite/*` and `/onboarding` go to
 *   `/sign-in?next=<path>`; signed-in visitors of `/sign-in` go to `next`.
 * - Signed-in users who have not finished onboarding go from every app route
 *   to `/onboarding?next=<path>`; onboarded users skip `/onboarding`.
 * - Visiting `/w/<slug>/…` remembers `<slug>` as the last used workspace.
 *
 * This is a UX gate only. Authorization is enforced by RLS on every query.
 */
export async function proxy(request: NextRequest) {
  const session = await updateSession(request);
  const { userId, supabase } = session;
  const { pathname, search, searchParams } = request.nextUrl;
  const redirect = (target: string) =>
    redirectWithCookies(request, session.response, target);

  if (!userId) {
    return isProtectedPath(pathname)
      ? redirect(signInPath(`${pathname}${search}`))
      : session.response;
  }

  if (isGuestOnlyPath(pathname)) {
    return redirect(
      safeNextPath(searchParams.get("next") ?? DEFAULT_NEXT_PATH),
    );
  }

  if (isProtectedPath(pathname)) {
    const onboarded = await isOnboarded(supabase, userId);
    const onOnboarding = isOnboardingPath(pathname);

    if (!onboarded && !onOnboarding) {
      return redirect(onboardingPath(`${pathname}${search}`));
    }
    if (onboarded && onOnboarding) {
      return redirect(safeNextPath(searchParams.get("next")));
    }
  }

  // Link prefetches are not visits: they must not move the last workspace.
  const workspaceSlug = workspaceSlugFromPath(pathname);
  if (workspaceSlug && !request.headers.has("next-router-prefetch")) {
    session.response.cookies.set(
      LAST_WORKSPACE_COOKIE,
      workspaceSlug,
      LAST_WORKSPACE_COOKIE_OPTIONS,
    );
  }

  return session.response;
}

export const config = {
  matcher: [
    // Everything except Next.js internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
