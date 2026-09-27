import { describe, expect, it } from "vitest";

import { lastWorkspaceCookie } from "./last-used";

describe("lastWorkspaceCookie", () => {
  it("stores the slug site-wide for a year", () => {
    expect(lastWorkspaceCookie("acme-data", false)).toBe(
      "tessera-last-workspace=acme-data; path=/; max-age=31536000; samesite=lax",
    );
  });

  it("is secure on https", () => {
    expect(lastWorkspaceCookie("acme", true)).toMatch(/; secure$/);
  });
});
