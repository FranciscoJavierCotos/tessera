"use client";

import { RouteError } from "@/components/states/route-error";

export default function WorkspaceError({ retry }: { retry: () => void }) {
  return <RouteError title="We could not load this workspace" retry={retry} />;
}
