import { describe, expect, it } from "vitest";

import { changeRoleSchema, inviteSchema } from "./schema";

describe("inviteSchema", () => {
  it("trims and lowercases the email", () => {
    expect(
      inviteSchema.parse({ email: "  Ada@Example.COM ", role: "admin" }),
    ).toEqual({ email: "ada@example.com", role: "admin" });
  });

  it.each(["", "not-an-email", "a@b"])("rejects email %j", (email) => {
    expect(inviteSchema.safeParse({ email, role: "member" }).success).toBe(
      false,
    );
  });

  it("rejects unknown roles", () => {
    expect(
      inviteSchema.safeParse({ email: "ada@example.com", role: "god" }).success,
    ).toBe(false);
  });
});

describe("changeRoleSchema", () => {
  it("requires uuids", () => {
    expect(
      changeRoleSchema.safeParse({
        workspaceId: "acme",
        userId: "ada",
        role: "member",
      }).success,
    ).toBe(false);
  });
});
