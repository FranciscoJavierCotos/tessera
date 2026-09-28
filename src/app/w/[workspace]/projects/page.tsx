import { FolderKanban, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Page } from "@/components/shell/page";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { projectPath } from "@/lib/project/paths";
import {
  canCreateProject,
  PROJECT_STATUS_LABELS,
  projectVisibility,
} from "@/lib/project/roles";
import {
  parseProjectFilter,
  PROJECT_FILTERS,
  type ProjectFilter,
} from "@/lib/project/schema";
import { requireUser } from "@/lib/profile/server";
import { cn } from "@/lib/utils";
import { workspaceMetadata } from "@/lib/workspace/metadata";
import { workspacePath } from "@/lib/workspace/paths";
import { getMyWorkspace } from "@/lib/workspace/server";

import { ProjectsTable } from "./projects-table";

export const generateMetadata = workspaceMetadata("Projects");

const FILTER_LABELS: Record<ProjectFilter, string> = {
  all: "All",
  ...PROJECT_STATUS_LABELS,
  archived: "Archived",
};

/** `YYYY-MM-DD` in UTC (stable across server and client). */
function day(timestamp: string) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** The projects the user can see, filtered by status (`?status=`). */
export default async function ProjectsPage({
  params,
  searchParams,
}: PageProps<"/w/[workspace]/projects">) {
  const workspace = await getMyWorkspace((await params).workspace);
  if (!workspace) notFound();
  const filter = parseProjectFilter((await searchParams).status);

  const { supabase } = await requireUser();
  let query = supabase
    .from("projects")
    .select(
      "id, slug, status, archived_at, updated_at, entities(title, visibility), project_members(count)",
    )
    .eq("workspace_id", workspace.id)
    .order("updated_at", { ascending: false });
  if (filter === "archived") query = query.not("archived_at", "is", null);
  else query = query.is("archived_at", null);
  if (filter !== "all" && filter !== "archived") {
    query = query.eq("status", filter);
  }
  const [projects, total] = await Promise.all([
    query,
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
  ]);
  if (projects.error || total.error) {
    throw new Error("Could not load the projects.");
  }

  const canCreate = canCreateProject(workspace.role);
  const newProjectHref = workspacePath(workspace.slug, "projects", "new");
  const newProjectButton = canCreate && (
    <Button asChild>
      <Link href={newProjectHref}>
        <Plus aria-hidden />
        New project
      </Link>
    </Button>
  );

  const header = (
    <PageHeader
      title="Projects"
      description="The team's units of work, with their members, assets and docs."
      actions={newProjectButton}
    />
  );

  if (!total.count) {
    return (
      <Page>
        {header}
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description={
            canCreate
              ? "Projects group the people, datasets and docs behind a piece of work. Start the first one."
              : "Projects group the people, datasets and docs behind a piece of work. Members of the workspace can start one."
          }
          action={
            canCreate && (
              <Button asChild variant="outline">
                <Link href={newProjectHref}>
                  <Plus aria-hidden />
                  Create a project
                </Link>
              </Button>
            )
          }
        />
      </Page>
    );
  }

  const rows = projects.data.flatMap((project) =>
    project.entities
      ? [
          {
            id: project.id,
            name: project.entities.title,
            href: projectPath(workspace.slug, project.slug),
            status: project.status,
            visibility: projectVisibility(project.entities.visibility),
            archived: project.archived_at !== null,
            members: project.project_members[0]?.count ?? 0,
            updated: day(project.updated_at),
          },
        ]
      : [],
  );

  return (
    <Page>
      {header}
      <div className="flex flex-col gap-3">
        <nav aria-label="Filter projects by status">
          <ul className="flex flex-wrap gap-1">
            {PROJECT_FILTERS.map((f) => (
              <li key={f}>
                <Link
                  href={
                    f === "all"
                      ? workspacePath(workspace.slug, "projects")
                      : `${workspacePath(workspace.slug, "projects")}?status=${f}`
                  }
                  aria-current={f === filter ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    f === filter && "bg-muted font-medium text-foreground",
                  )}
                >
                  {FILTER_LABELS[f]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ProjectsTable
          projects={rows}
          emptyTitle={
            filter === "archived"
              ? "No archived projects"
              : `No ${filter === "all" ? "open" : FILTER_LABELS[filter].toLowerCase()} projects`
          }
          emptyDescription="Try another filter."
        />
      </div>
    </Page>
  );
}
