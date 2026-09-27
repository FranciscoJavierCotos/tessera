import type { CookieMethodsServer, CookieOptions } from "@supabase/ssr";

/** The subset of Next.js' `cookies()` store the Supabase client needs. */
export type CookieStore = {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options?: CookieOptions): unknown;
};

/**
 * Adapts a Next.js cookie store to the `getAll`/`setAll` interface of
 * `@supabase/ssr`.
 *
 * Server Components cannot write cookies, so `set` throws there. That is safe
 * to ignore: the session is refreshed and its cookies written by `src/proxy.ts`
 * (F05) on every request. Server Actions and Route Handlers can write, so the
 * refreshed session is persisted there.
 */
export function createCookieMethods(store: CookieStore): CookieMethodsServer {
  return {
    getAll() {
      return store.getAll();
    },
    setAll(cookiesToSet) {
      try {
        for (const { name, value, options } of cookiesToSet) {
          store.set(name, value, options);
        }
      } catch {
        // Called from a Server Component: cookies are read-only there.
      }
    },
  };
}
