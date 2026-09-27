import { House } from "lucide-react";
import { describe, expect, it } from "vitest";

import { activeFeature, FEATURES, featuresFor, type Feature } from "./registry";

describe("FEATURES", () => {
  it("has unique ids that match their route segment", () => {
    const ids = FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const feature of FEATURES) {
      expect(feature.href("acme")).toBe(`/w/acme/${feature.id}`);
    }
  });

  it("covers the shell routes", () => {
    expect(FEATURES.map((f) => f.id)).toEqual([
      "home",
      "projects",
      "catalog",
      "docs",
      "settings",
    ]);
  });
});

describe("featuresFor", () => {
  const adminOnly: Feature = {
    id: "audit",
    label: "Audit",
    icon: House,
    href: (ws) => `/w/${ws}/audit`,
    minRole: "admin",
    group: "secondary",
  };
  const features = [...FEATURES, adminOnly];

  it("shows entries without `minRole` to everyone", () => {
    expect(featuresFor("viewer", features)).toHaveLength(FEATURES.length);
  });

  it("hides entries above the member's role", () => {
    expect(featuresFor("member", features)).not.toContain(adminOnly);
    expect(featuresFor("admin", features)).toContain(adminOnly);
    expect(featuresFor("owner", features)).toContain(adminOnly);
  });
});

describe("activeFeature", () => {
  it("matches the feature page and its sub-pages", () => {
    expect(activeFeature("/w/acme/catalog", "acme")?.id).toBe("catalog");
    expect(activeFeature("/w/acme/settings/members", "acme")?.id).toBe(
      "settings",
    );
  });

  it("does not match a prefix of another segment or another workspace", () => {
    expect(activeFeature("/w/acme/docsearch", "acme")).toBeUndefined();
    expect(activeFeature("/w/other/docs", "acme")).toBeUndefined();
  });
});
