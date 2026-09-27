/** `/w/<slug>/<...segments>`: a path inside a workspace. */
export function workspacePath(slug: string, ...segments: string[]): string {
  return ["", "w", slug, ...segments].join("/");
}

/** Where a workspace opens: its home page. */
export function workspaceHome(slug: string): string {
  return workspacePath(slug, "home");
}
