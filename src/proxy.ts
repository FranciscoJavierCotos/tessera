import type { NextRequest } from "next/server";

import {
  DEFAULT_NEXT_PATH,
  safeNextPath,
  signInPath,
} from "@/lib/auth/redirect";
import { isGuestOnlyPath, isProtectedPath } from "@/lib/auth/routes";
import { redirectWithCookies, updateSession } from "@/lib/supabase/proxy";

/**
 * Runs before every page request: refreshes the Supabase session cookies and
 * gates routes. Signed-out visitors of `/w/*`, `/u/*` and `/onboarding` go to
 * `/sign-in?next=<path>`; signed-in visitors of `/sign-in` go to `next`.
 *
 * This is a UX gate only. Authorization is enforced by RLS on every query.
 */
export async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const { pathname, search, searchParams } = request.nextUrl;

  if (!userId && isProtectedPath(pathname)) {
    return redirectWithCookies(
      request,
      response,
      signInPath(`${pathname}${search}`),
    );
  }

  if (userId && isGuestOnlyPath(pathname)) {
    const next = safeNextPath(searchParams.get("next") ?? DEFAULT_NEXT_PATH);
    return redirectWithCookies(request, response, next);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next.js internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
