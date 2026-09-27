import {
  BookOpen,
  Database,
  FolderKanban,
  House,
  Settings,
  type LucideIcon,
} from "lucide-react";

import { workspacePath } from "@/lib/workspace/paths";
import { hasRole, type WorkspaceRole } from "@/lib/workspace/roles";

export type Feature = {
  /** Stable id; also the first path segment under `/w/<slug>`. */
  id: string;
  label: string;
  icon: LucideIcon;
  /** The feature's page inside workspace `ws` (its slug). */
  href: (ws: string) => string;
  /** Least privileged role that sees the entry. Everyone when unset. */
  minRole?: WorkspaceRole;
  /** `primary` features lead the sidebar; `secondary` sit at the bottom. */
  group: "primary" | "secondary";
};

/**
 * Every workspace feature, in sidebar order. Later milestones plug in by
 * adding an entry here (plus its route under `src/app/w/[workspace]`).
 * `minRole` only hides navigation: RLS stays the authorization gate.
 */
export const FEATURES: readonly Feature[] = [
  {
    id: "home",
    label: "Home",
    icon: House,
    href: (ws) => workspacePath(ws, "home"),
    group: "primary",
  },
  {
    id: "projects",
    label: "Projects",
    icon: FolderKanban,
    href: (ws) => workspacePath(ws, "projects"),
    group: "primary",
  },
  {
    id: "catalog",
    label: "Catalog",
    icon: Database,
    href: (ws) => workspacePath(ws, "catalog"),
    group: "primary",
  },
  {
    id: "docs",
    label: "Docs",
    icon: BookOpen,
    href: (ws) => workspacePath(ws, "docs"),
    group: "primary",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    href: (ws) => workspacePath(ws, "settings"),
    group: "secondary",
  },
];

/** The features a member with `role` sees, in order. */
export function featuresFor(
  role: WorkspaceRole | null,
  features: readonly Feature[] = FEATURES,
): Feature[] {
  return features.filter((f) => !f.minRole || hasRole(role, f.minRole));
}

/** The feature that owns `pathname` inside workspace `ws`, if any. */
export function activeFeature(
  pathname: string,
  ws: string,
  features: readonly Feature[] = FEATURES,
): Feature | undefined {
  return features.find((f) => {
    const href = f.href(ws);
    return pathname === href || pathname.startsWith(`${href}/`);
  });
}
