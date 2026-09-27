import { describe, expect, it } from "vitest";

import { isGuestOnlyPath, isOnboardingPath, isProtectedPath } from "./routes";

describe("isProtectedPath", () => {
  it.each(["/w", "/w/acme", "/w/acme/settings", "/u/ada", "/onboarding"])(
    "protects %s",
    (path) => {
      expect(isProtectedPath(path)).toBe(true);
    },
  );

  it.each(["/", "/sign-in", "/auth/callback", "/auth/error", "/wiki", "/us"])(
    "leaves %s public",
    (path) => {
      expect(isProtectedPath(path)).toBe(false);
    },
  );
});

describe("isGuestOnlyPath", () => {
  it("covers the sign-in page only", () => {
    expect(isGuestOnlyPath("/sign-in")).toBe(true);
    expect(isGuestOnlyPath("/auth/callback")).toBe(false);
    expect(isGuestOnlyPath("/w")).toBe(false);
  });
});

describe("isOnboardingPath", () => {
  it("matches the onboarding flow only", () => {
    expect(isOnboardingPath("/onboarding")).toBe(true);
    expect(isOnboardingPath("/onboarding/workspace")).toBe(true);
    expect(isOnboardingPath("/onboardingx")).toBe(false);
    expect(isOnboardingPath("/w")).toBe(false);
  });
});
