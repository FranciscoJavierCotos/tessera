import { activeFeature, FEATURES, type Feature } from "@/features/registry";
import { workspaceHome, workspacePath } from "@/lib/workspace/paths";

export type Crumb = {
  label: string;
  /** Unset for the current page. */
  href?: string;
};

/** Labels for sub-pages that are not features themselves. */
const PAGE_LABELS: Record<string, string> = {
  members: "Members",
};

function labelFor(segment: string): string {
  const decoded = decodeURIComponent(segment);
  return (
    PAGE_LABELS[decoded] ??
    decoded.charAt(0).toUpperCase() + decoded.slice(1).replaceAll("-", " ")
  );
}

/**
 * Breadcrumbs for `pathname` inside a workspace: the workspace, then the
 * feature, then each sub-page. The last crumb is the current page (no link).
 */
export function workspaceBreadcrumbs(
  pathname: string,
  workspace: { slug: string; name: string },
  features: readonly Feature[] = FEATURES,
): Crumb[] {
  const base = workspacePath(workspace.slug);
  const crumbs: Crumb[] = [
    { label: workspace.name, href: workspaceHome(workspace.slug) },
  ];
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return crumbs;

  const segments = pathname.slice(base.length).split("/").filter(Boolean);
  const feature = activeFeature(pathname, workspace.slug, features);
  // Home is the workspace itself: "Acme", not "Acme / Home".
  if (feature?.id === "home" && segments.length === 1) {
    return [{ label: workspace.name }];
  }

  segments.forEach((segment, index) => {
    crumbs.push({
      label: index === 0 && feature ? feature.label : labelFor(segment),
      href: workspacePath(workspace.slug, ...segments.slice(0, index + 1)),
    });
  });
  delete crumbs.at(-1)!.href;
  return crumbs;
}
