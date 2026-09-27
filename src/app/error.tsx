"use client";

import { RouteError } from "@/components/states/route-error";

/** Last-resort boundary for pages without a closer `error.tsx`. */
export default function AppError({ retry }: { retry: () => void }) {
  return <RouteError retry={retry} />;
}
