import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import type { Database } from "@/lib/db/types";

/**
 * Refreshes the Supabase session for `request` and returns the (possibly
 * refreshed) user id plus a response that carries the updated cookies.
 *
 * Refreshed cookies are written to both the request (so Server Components in
 * this request see them) and the response (so the browser stores them). Any
 * redirect built from here must copy `response`'s cookies, or the session is
 * lost.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // Cache-Control etc.: responses that set auth cookies must not be cached.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Do not run code between creating the client and this call: it refreshes
  // the session. `getClaims` verifies the JWT, unlike `getSession`.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub ?? null;

  return { response, userId };
}

/** Redirects to the relative `target`, keeping refreshed auth cookies. */
export function redirectWithCookies(
  request: NextRequest,
  from: NextResponse,
  target: string,
) {
  const redirect = NextResponse.redirect(new URL(target, request.url));
  for (const cookie of from.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  const cacheControl = from.headers.get("cache-control");
  if (cacheControl) redirect.headers.set("cache-control", cacheControl);
  return redirect;
}
