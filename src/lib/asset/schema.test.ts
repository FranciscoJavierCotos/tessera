import { describe, expect, it } from "vitest";

import { fieldErrors } from "@/lib/forms";

import {
  assetSchema,
  catalogSearch,
  columnsPayload,
  hasCatalogFilters,
  normalizeTags,
  parseCatalogQuery,
  parseProperties,
  propertiesFor,
  suggestQualifiedName,
} from "./schema";

const OWNER = "5d0f3c1e-8a47-4c1b-9d33-2f6b1a7c9e10";

const dataset = {
  kind: "dataset",
  name: " Orders ",
  qualifiedName: " analytics.marts.fct_orders ",
  description: " One row per order. ",
  ownerId: OWNER,
  tags: [" Finance ", "finance", "core"],
  columns: [
    { name: " order_id ", dataType: "bigint", description: "", isPii: false },
    {
      name: "email",
      dataType: "text",
      description: "Buyer email",
      isPii: true,
    },
  ],
};

describe("assetSchema", () => {
  it("trims a dataset and normalizes its tags", () => {
    expect(assetSchema.parse(dataset)).toEqual({
      kind: "dataset",
      name: "Orders",
      qualifiedName: "analytics.marts.fct_orders",
      description: "One row per order.",
      ownerId: OWNER,
      tags: ["finance", "core"],
      columns: [
        {
          name: "order_id",
          dataType: "bigint",
          description: "",
          isPii: false,
        },
        {
          name: "email",
          dataType: "text",
          description: "Buyer email",
          isPii: true,
        },
      ],
    });
  });

  it("requires db.schema.table (or schema.table) for datasets", () => {
    for (const qualifiedName of ["orders", "a..b", ".a.b", "a.b.c.d"]) {
      const result = assetSchema.safeParse({ ...dataset, qualifiedName });
      expect(result.success, qualifiedName).toBe(false);
      expect(fieldErrors(result.error!).qualifiedName).toBe(
        "Use db.schema.table (or schema.table).",
      );
    }
    expect(
      assetSchema.safeParse({ ...dataset, qualifiedName: "marts.orders" })
        .success,
    ).toBe(true);
  });

  it("rejects characters that break the asset URL and reserved names", () => {
    const spaced = assetSchema.safeParse({
      ...dataset,
      kind: "dashboard",
      qualifiedName: "looker/revenue overview",
      properties: { url: "https://looker.example.com/1", tool: "looker" },
    });
    expect(fieldErrors(spaced.error!).qualifiedName).toBe(
      "Spaces and / ? # % \\ are not allowed.",
    );
    const reserved = assetSchema.safeParse({
      kind: "ml_model",
      name: "New",
      qualifiedName: "NEW",
      description: "",
      ownerId: OWNER,
      tags: [],
      properties: { framework: "", url: "" },
    });
    expect(fieldErrors(reserved.error!).qualifiedName).toBe(
      "That name is reserved. Try another.",
    );
  });

  it("flags duplicate column names case-insensitively", () => {
    const result = assetSchema.safeParse({
      ...dataset,
      columns: [
        { name: "id", dataType: "", description: "", isPii: false },
        { name: "ID", dataType: "", description: "", isPii: false },
      ],
    });
    expect(fieldErrors(result.error!)).toEqual({
      "columns.1.name": "Column names must be unique.",
    });
  });

  it("validates tags", () => {
    const result = assetSchema.safeParse({
      ...dataset,
      tags: ["has space"],
    });
    expect(fieldErrors(result.error!)["tags.0"]).toMatch(/lowercase letters/);
    const many = assetSchema.safeParse({
      ...dataset,
      tags: Array.from({ length: 21 }, (_, i) => `t${i}`),
    });
    expect(fieldErrors(many.error!).tags).toBe("Add at most 20 tags.");
  });

  it("requires a URL and a tool for dashboards", () => {
    const result = assetSchema.safeParse({
      kind: "dashboard",
      name: "Revenue",
      qualifiedName: "looker.revenue",
      description: "",
      ownerId: OWNER,
      tags: [],
      properties: { url: "", tool: "excel" },
    });
    expect(fieldErrors(result.error!)).toEqual({
      "properties.url": "Enter the dashboard URL.",
      "properties.tool": "Choose a tool.",
    });
    const badUrl = assetSchema.safeParse({
      kind: "dashboard",
      name: "Revenue",
      qualifiedName: "looker.revenue",
      description: "",
      ownerId: OWNER,
      tags: [],
      properties: { url: "javascript:alert(1)", tool: "looker" },
    });
    expect(fieldErrors(badUrl.error!)["properties.url"]).toBeDefined();
  });

  it("allows empty optional properties for source systems and models", () => {
    const parsed = assetSchema.parse({
      kind: "source_system",
      name: "Shop app",
      qualifiedName: "postgres.shop_app",
      description: "",
      ownerId: OWNER,
      tags: [],
      properties: { system: " PostgreSQL ", url: "" },
    });
    expect(propertiesFor(parsed)).toEqual({ system: "PostgreSQL" });
  });

  it("requires an owner", () => {
    const result = assetSchema.safeParse({ ...dataset, ownerId: "" });
    expect(fieldErrors(result.error!).ownerId).toBe("Choose an owner.");
  });
});

describe("helpers", () => {
  it("normalizeTags lowercases and dedupes in order", () => {
    expect(normalizeTags([" B", "a", "b", ""])).toEqual(["b", "a"]);
  });

  it("parseProperties keeps known fields only", () => {
    expect(
      parseProperties({ url: "https://x.io", tool: "looker", extra: 1 }),
    ).toEqual({
      url: "https://x.io",
      tool: "looker",
      system: undefined,
      framework: undefined,
    });
    expect(parseProperties({ tool: "excel" }).tool).toBeUndefined();
    expect(parseProperties(null)).toEqual({});
    expect(parseProperties([1])).toEqual({});
  });

  it("columnsPayload maps to the RPC shape", () => {
    expect(
      columnsPayload([
        { name: "id", dataType: "int", description: "Key", isPii: false },
      ]),
    ).toEqual([
      { name: "id", data_type: "int", description: "Key", is_pii: false },
    ]);
  });

  it("suggestQualifiedName snake-cases a name", () => {
    expect(suggestQualifiedName("Revenue Overview (EU)")).toBe(
      "revenue_overview_eu",
    );
    expect(suggestQualifiedName("Crème brûlée")).toBe("creme_brulee");
    expect(suggestQualifiedName("marts.fct_orders")).toBe("marts.fct_orders");
  });
});

describe("catalog query", () => {
  it("parses filters, sort and page; invalid values fall back", () => {
    expect(
      parseCatalogQuery({
        kind: "dashboard",
        owner: OWNER,
        tag: "Finance",
        project: "revenue-revamp",
        sort: "name",
        page: "3",
      }),
    ).toEqual({
      kind: "dashboard",
      owner: OWNER,
      tag: "finance",
      project: "revenue-revamp",
      sort: "name",
      page: 3,
    });
    expect(
      parseCatalogQuery({
        kind: "table",
        owner: "me",
        tag: "has space",
        project: "x",
        sort: "size",
        page: "-1",
      }),
    ).toEqual({
      kind: null,
      owner: null,
      tag: null,
      project: null,
      sort: "updated",
      page: 1,
    });
  });

  it("catalogSearch leaves defaults out and round-trips", () => {
    const query = parseCatalogQuery({ kind: "dataset", page: "2" });
    expect(catalogSearch(query)).toBe("?kind=dataset&page=2");
    expect(catalogSearch(parseCatalogQuery({}))).toBe("");
    expect(hasCatalogFilters(query)).toBe(true);
    expect(hasCatalogFilters(parseCatalogQuery({ sort: "name" }))).toBe(false);
  });
});
