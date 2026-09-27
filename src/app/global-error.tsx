"use client";

import "./globals.css";

/**
 * Replaces the root layout when it fails, so it brings its own document and
 * cannot use the theme provider (it follows the OS color scheme).
 */
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center font-sans antialiased">
        <title>Something went wrong · Tessera</title>
        <main className="flex max-w-md flex-col items-center gap-4">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            Tessera could not load. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
