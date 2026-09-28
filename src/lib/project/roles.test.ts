import { describe, expect, it } from "vitest";

import {
  canCreateProject,
  canEditProject,
  canManageProject,
  projectVisibility,
} from "./roles";

describe("project permissions (mirror of the RLS helpers)", () => {
  it("workspace owners and admins edit and manage any project", () => {
    for (const ws of ["owner", "admin"] as const) {
      expect(canEditProject(ws, null)).toBe(true);
      expect(canManageProject(ws, null)).toBe(true);
    }
  });

  it("a lead edits and manages; a contributor only edits", () => {
    expect(canEditProject("member", "lead")).toBe(true);
    expect(canManageProject("member", "lead")).toBe(true);
    expect(canEditProject("member", "contributor")).toBe(true);
    expect(canManageProject("member", "contributor")).toBe(false);
  });

  it("a project viewer and a non-member cannot edit", () => {
    expect(canEditProject("member", "viewer")).toBe(false);
    expect(canEditProject("member", null)).toBe(false);
  });

  it("a workspace viewer is read-only whatever their project role", () => {
    expect(canEditProject("viewer", "lead")).toBe(false);
    expect(canManageProject("viewer", "lead")).toBe(false);
    expect(canEditProject(null, "lead")).toBe(false);
  });

  it("members and above create projects", () => {
    expect(canCreateProject("member")).toBe(true);
    expect(canCreateProject("admin")).toBe(true);
    expect(canCreateProject("viewer")).toBe(false);
    expect(canCreateProject(null)).toBe(false);
  });
});

describe("projectVisibility", () => {
  it("maps entity visibility to workspace or private", () => {
    expect(projectVisibility("workspace")).toBe("workspace");
    expect(projectVisibility("project")).toBe("private");
    expect(projectVisibility("private")).toBe("private");
  });
});
