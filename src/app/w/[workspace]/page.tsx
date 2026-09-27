import { notFound, redirect } from "next/navigation";

import { workspaceHome } from "@/lib/workspace/paths";
import { getMyWorkspace } from "@/lib/workspace/server";

/** `/w/<slug>` opens the workspace home (non-members get the 404). */
export default async function WorkspacePage({
  params,
}: PageProps<"/w/[workspace]">) {
  const workspace = await getMyWorkspace((await params).workspace);
  if (!workspace) notFound();
  redirect(workspaceHome(workspace.slug));
}
