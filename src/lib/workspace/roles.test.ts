import { describe, expect, it } from "vitest";

import {
  assignableRoles,
  canManageMember,
  canManageMembers,
  hasRole,
  isLastOwner,
} from "./roles";

describe("hasRole", () => {
  it.each([
    ["owner", "admin", true],
    ["admin", "admin", true],
    ["member", "admin", false],
    ["viewer", "viewer", true],
    ["viewer", "member", false],
    [null, "viewer", false],
  ] as const)("%s ≥ %s → %s", (role, min, expected) => {
    expect(hasRole(role, min)).toBe(expected);
  });
});

describe("canManageMembers", () => {
  it.each([
    ["owner", true],
    ["admin", true],
    ["member", false],
    ["viewer", false],
    [null, false],
  ] as const)("%s → %s", (role, expected) => {
    expect(canManageMembers(role)).toBe(expected);
  });
});

describe("assignableRoles", () => {
  it("owners grant every role", () => {
    expect(assignableRoles("owner")).toEqual([
      "owner",
      "admin",
      "member",
      "viewer",
    ]);
  });

  it("admins grant everything but owner", () => {
    expect(assignableRoles("admin")).toEqual(["admin", "member", "viewer"]);
  });

  it.each(["member", "viewer", null] as const)("%s grants nothing", (role) => {
    expect(assignableRoles(role)).toEqual([]);
  });
});

describe("canManageMember", () => {
  it("owners manage anyone, including owners", () => {
    expect(canManageMember("owner", "owner")).toBe(true);
    expect(canManageMember("owner", "viewer")).toBe(true);
  });

  it("admins manage everyone but owners", () => {
    expect(canManageMember("admin", "owner")).toBe(false);
    expect(canManageMember("admin", "admin")).toBe(true);
    expect(canManageMember("admin", "member")).toBe(true);
  });

  it("members and viewers manage no one", () => {
    expect(canManageMember("member", "viewer")).toBe(false);
    expect(canManageMember("viewer", "viewer")).toBe(false);
  });
});

describe("isLastOwner", () => {
  it("is true only for an owner when there is a single owner", () => {
    expect(isLastOwner("owner", 1)).toBe(true);
    expect(isLastOwner("owner", 2)).toBe(false);
    expect(isLastOwner("admin", 1)).toBe(false);
  });
});
