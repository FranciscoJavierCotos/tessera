import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Page } from "@/components/shell/page";
import { canCreateProject } from "@/lib/project/roles";
import { workspaceMetadata } from "@/lib/workspace/metadata";
import { workspacePath } from "@/lib/workspace/paths";
import { getMyWorkspace } from "@/lib/workspace/server";

import { ProjectForm } from "../project-form";

export const generateMetadata = workspaceMetadata("New project");

export default async function NewProjectPage({
  params,
}: PageProps<"/w/[workspace]/projects/new">) {
  const workspace = await getMyWorkspace((await params).workspace);
  if (!workspace) notFound();
  const projectsHref = workspacePath(workspace.slug, "projects");
  if (!canCreateProject(workspace.role)) redirect(projectsHref);

  return (
    <Page size="narrow">
      <PageHeader
        title="New project"
        description="You become its lead. You can add members once it exists."
      />
      <ProjectForm workspace={workspace} cancelHref={projectsHref} />
    </Page>
  );
}
