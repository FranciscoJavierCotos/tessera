"use client";

import { RouteError } from "@/components/states/route-error";

export default function ProfileError({ retry }: { retry: () => void }) {
  return <RouteError title="We could not load this profile" retry={retry} />;
}
