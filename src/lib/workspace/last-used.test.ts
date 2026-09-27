import { describe, expect, it } from "vitest";

import { workspaceSlugFromPath } from "./last-used";

describe("workspaceSlugFromPath", () => {
  it.each([
    ["/w/acme", "acme"],
    ["/w/acme/", "acme"],
    ["/w/acme/settings/members", "acme"],
    ["/w/Acme-Data", "acme-data"],
  ])("%s → %s", (path, slug) => {
    expect(workspaceSlugFromPath(path)).toBe(slug);
  });

  it.each([
    "/w",
    "/w/",
    "/w/new",
    "/w/ab",
    "/w/acme_data",
    "/u/acme",
    "/wx/acme",
  ])("ignores %s", (path) => {
    expect(workspaceSlugFromPath(path)).toBeNull();
  });
});
