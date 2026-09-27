"use client";

import { RouteError } from "@/components/states/route-error";

export default function WorkspaceError({ retry }: { retry: () => void }) {
  return (
    <RouteError as="div" title="We could not load this page" retry={retry} />
  );
}
