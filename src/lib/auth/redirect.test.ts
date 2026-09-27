import { describe, expect, it } from "vitest";

import {
  DEFAULT_NEXT_PATH,
  onboardingPath,
  safeNextPath,
  signInPath,
} from "./redirect";

describe("safeNextPath", () => {
  it.each([
    ["/w", "/w"],
    ["/w/acme/home", "/w/acme/home"],
    ["/w/acme?tab=members#top", "/w/acme?tab=members#top"],
    ["/u/ada", "/u/ada"],
  ])("keeps same-origin path %s", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });

  it.each([
    ["missing", undefined],
    ["non-string", ["/w"]],
    ["empty", ""],
    ["relative", "w/acme"],
    ["absolute URL", "https://evil.example/w"],
    ["javascript URL", "javascript:alert(1)"],
    ["protocol-relative", "//evil.example"],
    ["backslash", "/\\evil.example"],
    ["tab-smuggled slashes", "/\t/evil.example"],
    ["newline", "/w\n"],
  ])("falls back to the default for %s", (_label, next) => {
    expect(safeNextPath(next)).toBe(DEFAULT_NEXT_PATH);
  });

  it("normalizes dot segments without leaving the origin", () => {
    expect(safeNextPath("/w/../../etc")).toBe("/etc");
  });
});

describe("signInPath", () => {
  it("carries the path in `next`", () => {
    expect(signInPath("/w/acme?tab=1")).toBe(
      "/sign-in?next=%2Fw%2Facme%3Ftab%3D1",
    );
  });

  it("omits `next` for the default destination", () => {
    expect(signInPath("/w")).toBe("/sign-in");
  });
});

describe("onboardingPath", () => {
  it("carries the path in `next`", () => {
    expect(onboardingPath("/u/ada")).toBe("/onboarding?next=%2Fu%2Fada");
  });

  it("omits `next` for the default or an unsafe destination", () => {
    expect(onboardingPath("/w")).toBe("/onboarding");
    expect(onboardingPath("//evil.example")).toBe("/onboarding");
  });
});
