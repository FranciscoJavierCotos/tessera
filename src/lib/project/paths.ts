import { workspacePath } from "@/lib/workspace/paths";

/** `/w/<workspace>/projects/<project>/<...segments>`. */
export function projectPath(
  workspace: string,
  project: string,
  ...segments: string[]
): string {
  return workspacePath(workspace, "projects", project, ...segments);
}
