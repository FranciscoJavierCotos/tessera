"use client";

import { RouteError } from "@/components/states/route-error";

export default function OnboardingError({ retry }: { retry: () => void }) {
  return (
    <RouteError
      title="We could not load onboarding"
      description="Your progress is saved. Try again in a moment."
      retry={retry}
    />
  );
}
