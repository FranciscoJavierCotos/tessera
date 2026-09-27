import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

/** Minimal top bar for signed-in pages until the app shell lands (F08). */
export async function AppHeader({ handle }: { handle?: string | null }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-6">
        <Link
          href="/w"
          className="rounded-sm font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Tessera
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          {handle && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/u/${handle}`}>Your profile</Link>
            </Button>
          )}
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </nav>
      </div>
    </header>
  );
}
