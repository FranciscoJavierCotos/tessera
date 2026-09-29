import { describe, expect, it } from "vitest";

import { workspaceBreadcrumbs } from "./breadcrumbs";

const acme = { slug: "acme", name: "Acme Data" };

describe("workspaceBreadcrumbs", () => {
  it("home is the workspace alone", () => {
    expect(workspaceBreadcrumbs("/w/acme/home", acme)).toEqual([
      { label: "Acme Data" },
    ]);
  });

  it("a feature page links back to the workspace", () => {
    expect(workspaceBreadcrumbs("/w/acme/catalog", acme)).toEqual([
      { label: "Acme Data", href: "/w/acme/home" },
      { label: "Catalog" },
    ]);
  });

  it("sub-pages link to each parent", () => {
    expect(workspaceBreadcrumbs("/w/acme/settings/members", acme)).toEqual([
      { label: "Acme Data", href: "/w/acme/home" },
      { label: "Settings", href: "/w/acme/settings" },
      { label: "Members" },
    ]);
  });

  it("unknown segments get a readable label", () => {
    expect(workspaceBreadcrumbs("/w/acme/data-contracts", acme)).toEqual([
      { label: "Acme Data", href: "/w/acme/home" },
      { label: "Data contracts" },
    ]);
  });

  it("identifiers such as qualified names keep their spelling", () => {
    expect(
      workspaceBreadcrumbs(
        "/w/acme/catalog/analytics.marts.fct_orders/edit",
        acme,
      ),
    ).toEqual([
      { label: "Acme Data", href: "/w/acme/home" },
      { label: "Catalog", href: "/w/acme/catalog" },
      {
        label: "analytics.marts.fct_orders",
        href: "/w/acme/catalog/analytics.marts.fct_orders",
      },
      { label: "Edit" },
    ]);
  });

  it("paths outside the workspace only show the workspace", () => {
    expect(workspaceBreadcrumbs("/w/other/home", acme)).toEqual([
      { label: "Acme Data", href: "/w/acme/home" },
    ]);
  });
});
