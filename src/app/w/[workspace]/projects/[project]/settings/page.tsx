import { Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Page } from "@/components/shell/page";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { projectPath } from "@/lib/project/paths";
import { canEditProject, canManageProject } from "@/lib/project/roles";
import { getProject } from "@/lib/project/server";
import { getMyWorkspace } from "@/lib/workspace/server";

import { ProjectForm } from "../../project-form";
import { ArchiveProject } from "./archive-project";

export async function generateMetadata({
  params,
}: PageProps<"/w/[workspace]/projects/[project]/settings">) {
  const { workspace: slug, project: projectSlug } = await params;
  const workspace = await getMyWorkspace(slug);
  const project = workspace && (await getProject(workspace.id, projectSlug));
  const parts = ["Settings", project?.name, workspace?.name, "Tessera"];
  return { title: parts.filter(Boolean).join(" · ") };
}

/** Edit a project's details; leads also archive it and change visibility. */
export default async function ProjectSettingsPage({
  params,
}: PageProps<"/w/[workspace]/projects/[project]/settings">) {
  const { workspace: slug, project: projectSlug } = await params;
  const workspace = await getMyWorkspace(slug);
  if (!workspace) notFound();
  const project = await getProject(workspace.id, projectSlug);
  if (!project) notFound();

  const home = projectPath(workspace.slug, project.slug);
  const canEdit = canEditProject(workspace.role, project.myRole);
  const canManage = canManageProject(workspace.role, project.myRole);

  return (
    <Page size="narrow">
      <PageHeader
        title="Project settings"
        description={`How ${project.name} is described and who can see it.`}
      />
      {canEdit ? (
        <>
          <ProjectForm
            workspace={workspace}
            projectId={project.id}
            cancelHref={home}
            canChangeVisibility={canManage}
            initial={{
              name: project.name,
              slug: project.slug,
              description: project.description,
              status: project.status,
              visibility: project.visibility,
            }}
          />
          {canManage && (
            <ArchiveProject
              projectId={project.id}
              archived={project.archivedAt !== null}
            />
          )}
        </>
      ) : (
        <EmptyState
          icon={Lock}
          title="You can view this project but not edit it"
          description="Ask a project lead to make you a contributor."
          action={
            <Button asChild variant="outline">
              <Link href={home}>Back to the project</Link>
            </Button>
          }
        />
      )}
    </Page>
  );
}
