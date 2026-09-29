import { workspacePath } from "@/lib/workspace/paths";

/** `/w/<workspace>/catalog/<qualified name>/<...segments>`. */
export function assetPath(
  workspace: string,
  qualifiedName: string,
  ...segments: string[]
): string {
  return workspacePath(
    workspace,
    "catalog",
    encodeURIComponent(qualifiedName),
    ...segments,
  );
}
