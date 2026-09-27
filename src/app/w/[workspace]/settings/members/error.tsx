"use client";

import { RouteError } from "@/components/states/route-error";

export default function MembersError({ retry }: { retry: () => void }) {
  return <RouteError title="We could not load the members" retry={retry} />;
}
