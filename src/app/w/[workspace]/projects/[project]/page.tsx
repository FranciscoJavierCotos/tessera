import { Activity, Archive, Database, FileText, Settings } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Page } from "@/components/shell/page";
import { EmptyState } from "@/components/states/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { avatarUrl, requireUser } from "@/lib/profile/server";
import { projectPath } from "@/lib/project/paths";
import { canEditProject, canManageProject } from "@/lib/project/roles";
import { getProject } from "@/lib/project/server";
import { workspacePath } from "@/lib/workspace/paths";
import { getMyWorkspace } from "@/lib/workspace/server";

import { StatusBadge, VisibilityLabel } from "../projects-table";
import { ProjectMembers } from "./project-members";

export async function generateMetadata({
  params,
}: PageProps<"/w/[workspace]/projects/[project]">) {
  const { workspace: slug, project: projectSlug } = await params;
  const workspace = await getMyWorkspace(slug);
  const project = workspace && (await getProject(workspace.id, projectSlug));
  const parts = [project?.name ?? "Project", workspace?.name, "Tessera"];
  return { title: parts.filter(Boolean).join(" · ") };
}

/** A project's home: overview, members and slots filled by later features. */
export default async function ProjectPage({
  params,
}: PageProps<"/w/[workspace]/projects/[project]">) {
  const { workspace: slug, project: projectSlug } = await params;
  const workspace = await getMyWorkspace(slug);
  if (!workspace) notFound();
  const project = await getProject(workspace.id, projectSlug);
  if (!project) notFound();

  const { supabase, userId } = await requireUser();
  const canEdit = canEditProject(workspace.role, project.myRole);
  const canManage = canManageProject(workspace.role, project.myRole);

  const [members, workspaceMembers] = await Promise.all([
    supabase
      .from("project_members")
      .select("user_id, role, profiles(display_name, handle, avatar_path)")
      .eq("project_id", project.id)
      .order("added_at"),
    canManage
      ? supabase
          .from("workspace_members")
          .select("user_id, profiles(display_name, handle)")
          .eq("workspace_id", workspace.id)
      : null,
  ]);
  if (members.error || workspaceMembers?.error) {
    throw new Error("Could not load the project members.");
  }

  const avatars = await Promise.all(
    members.data.map((m) =>
      avatarUrl(supabase, m.profiles?.avatar_path ?? null),
    ),
  );
  const inProject = new Set(members.data.map((m) => m.user_id));
  const candidates = (workspaceMembers?.data ?? [])
    .filter((m) => !inProject.has(m.user_id))
    .map((m) => ({
      userId: m.user_id,
      label:
        m.profiles?.display_name ??
        (m.profiles?.handle ? `@${m.profiles.handle}` : "Unnamed member"),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <Page>
      <PageHeader
        title={project.name}
        description={
          <span className="flex flex-wrap items-center gap-3">
            {project.archivedAt ? (
              <Badge variant="outline">
                <Archive aria-hidden />
                Archived
              </Badge>
            ) : (
              <StatusBadge status={project.status} />
            )}
            <VisibilityLabel visibility={project.visibility} />
          </span>
        }
        actions={
          canEdit && (
            <Button asChild variant="outline">
              <Link
                href={projectPath(workspace.slug, project.slug, "settings")}
              >
                <Settings aria-hidden />
                Project settings
              </Link>
            </Button>
          )
        }
      />

      {project.archivedAt && (
        <Alert>
          <Archive aria-hidden />
          <AlertTitle>This project is archived</AlertTitle>
          <AlertDescription>
            It is hidden from the projects list.{" "}
            {canManage
              ? "Restore it from the project settings."
              : "A project lead can restore it."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <section
            aria-labelledby="overview-heading"
            className="flex flex-col gap-2"
          >
            <h2 id="overview-heading" className="text-base font-semibold">
              Overview
            </h2>
            {project.description ? (
              <p className="text-sm whitespace-pre-wrap">
                {project.description}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No description yet.
              </p>
            )}
          </section>

          <section
            aria-labelledby="assets-heading"
            className="flex flex-col gap-3"
          >
            <h2 id="assets-heading" className="text-base font-semibold">
              Linked assets
            </h2>
            <EmptyState
              icon={Database}
              headingLevel={3}
              title="No linked assets"
              description="Datasets, dashboards and models the project uses will be listed here."
            />
          </section>

          <section
            aria-labelledby="pages-heading"
            className="flex flex-col gap-3"
          >
            <h2 id="pages-heading" className="text-base font-semibold">
              Pages
            </h2>
            <EmptyState
              icon={FileText}
              headingLevel={3}
              title="No pages yet"
              description="The project's docs, meeting notes and runbooks will live here."
            />
          </section>

          <section
            aria-labelledby="feed-heading"
            className="flex flex-col gap-3"
          >
            <h2 id="feed-heading" className="text-base font-semibold">
              Activity
            </h2>
            <EmptyState
              icon={Activity}
              headingLevel={3}
              title="No activity yet"
              description="Changes, comments and decisions in the project will show up here."
            />
          </section>
        </div>

        <ProjectMembers
          projectId={project.id}
          workspaceId={workspace.id}
          projectsHref={workspacePath(workspace.slug, "projects")}
          currentUserId={userId}
          canManage={canManage}
          candidates={candidates}
          members={members.data.map((member, index) => ({
            userId: member.user_id,
            role: member.role,
            name: member.profiles?.display_name ?? null,
            handle: member.profiles?.handle ?? null,
            avatar: avatars[index] ?? null,
          }))}
        />
      </div>
    </Page>
  );
}
