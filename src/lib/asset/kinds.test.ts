import { describe, expect, it } from "vitest";

import { canDeleteAsset, canEditAssets } from "./kinds";

const ME = "me";
const OTHER = "other";

describe("asset permissions (mirror of the RLS policies)", () => {
  it("members and above edit assets; viewers do not", () => {
    expect(canEditAssets("owner")).toBe(true);
    expect(canEditAssets("member")).toBe(true);
    expect(canEditAssets("viewer")).toBe(false);
    expect(canEditAssets(null)).toBe(false);
  });

  it("the owner or a workspace owner/admin deletes", () => {
    expect(canDeleteAsset("member", ME, ME)).toBe(true);
    expect(canDeleteAsset("member", OTHER, ME)).toBe(false);
    expect(canDeleteAsset("admin", OTHER, ME)).toBe(true);
    expect(canDeleteAsset("owner", OTHER, ME)).toBe(true);
    expect(canDeleteAsset("viewer", ME, ME)).toBe(false);
  });
});
