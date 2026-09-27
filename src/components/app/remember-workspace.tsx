"use client";

import { useEffect } from "react";

import { lastWorkspaceCookie } from "@/lib/workspace/last-used";

/**
 * Records the open workspace as the last used one. Runs on real visits only
 * (link prefetches never mount it), so prefetching another workspace does not
 * change where `/w` goes.
 */
export function RememberWorkspace({ slug }: { slug: string }) {
  useEffect(() => {
    document.cookie = lastWorkspaceCookie(
      slug,
      window.location.protocol === "https:",
    );
  }, [slug]);
  return null;
}
