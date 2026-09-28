import { describe, expect, it } from "vitest";

import { fieldErrors } from "@/lib/forms";

import { parseProjectFilter, projectSchema } from "./schema";

const valid = {
  name: "  Revenue revamp ",
  slug: " Revenue-Revamp ",
  description: " Rebuild the revenue dashboard. ",
  status: "active",
  visibility: "private",
};

describe("projectSchema", () => {
  it("trims and lowercases", () => {
    expect(projectSchema.parse(valid)).toEqual({
      name: "Revenue revamp",
      slug: "revenue-revamp",
      description: "Rebuild the revenue dashboard.",
      status: "active",
      visibility: "private",
    });
  });

  it("rejects a blank name, a bad or reserved slug and unknown enums", () => {
    const result = projectSchema.safeParse({
      name: " ",
      slug: "no",
      description: "",
      status: "archived",
      visibility: "project",
    });
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!)).toEqual({
      name: "Name your project.",
      slug: "Use 3–40 lowercase letters, numbers and dashes.",
      status: "Choose a status.",
      visibility: "Choose who can see it.",
    });

    const reserved = projectSchema.safeParse({ ...valid, slug: "new" });
    expect(fieldErrors(reserved.error!).slug).toBe(
      "That URL is reserved. Try another.",
    );
  });

  it("caps the description at 5000 characters", () => {
    const result = projectSchema.safeParse({
      ...valid,
      description: "x".repeat(5001),
    });
    expect(result.success).toBe(false);
  });
});

describe("parseProjectFilter", () => {
  it("accepts statuses and archived; anything else is all", () => {
    expect(parseProjectFilter("paused")).toBe("paused");
    expect(parseProjectFilter("archived")).toBe("archived");
    expect(parseProjectFilter(["done", "active"])).toBe("done");
    expect(parseProjectFilter("nope")).toBe("all");
    expect(parseProjectFilter(undefined)).toBe("all");
  });
});
