import "server-only";

import type { Metadata } from "next";

import { getMyWorkspace } from "./server";

/**
 * `generateMetadata` for a workspace page: "<page> · <workspace> · Tessera".
 * Shares the per-request workspace lookup with the layout.
 */
export function workspaceMetadata(page?: string) {
  return async ({
    params,
  }: {
    params: Promise<{ workspace: string }>;
  }): Promise<Metadata> => {
    const workspace = await getMyWorkspace((await params).workspace);
    const parts = [page, workspace?.name ?? "Workspace", "Tessera"];
    return { title: parts.filter(Boolean).join(" · ") };
  };
}
