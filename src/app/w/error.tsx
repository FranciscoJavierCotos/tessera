"use client";

import { RouteError } from "@/components/states/route-error";

export default function WorkspacesError({ retry }: { retry: () => void }) {
  return <RouteError title="We could not load your workspaces" retry={retry} />;
}
