"use client";

import { Archive, FolderKanban, Globe, Lock } from "lucide-react";
import Link from "next/link";

import { DataTable, dataTableColumns } from "@/components/data-table";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  PROJECT_STATUS_LABELS,
  VISIBILITY_LABELS,
  type ProjectStatus,
  type ProjectVisibility,
} from "@/lib/project/roles";

export type ProjectRow = {
  id: string;
  name: string;
  href: string;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  archived: boolean;
  members: number;
  /** `YYYY-MM-DD` (UTC). */
  updated: string;
};

const column = dataTableColumns<ProjectRow>();
const columns = [
  column.accessor("name", {
    header: "Name",
    cell: (info) => (
      <Link
        href={info.row.original.href}
        className="rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  column.accessor("status", {
    header: "Status",
    cell: (info) =>
      info.row.original.archived ? (
        <Badge variant="outline">
          <Archive aria-hidden />
          Archived
        </Badge>
      ) : (
        <StatusBadge status={info.getValue()} />
      ),
  }),
  column.accessor("visibility", {
    header: "Visibility",
    cell: (info) => <VisibilityLabel visibility={info.getValue()} />,
  }),
  column.accessor("members", { header: "Members" }),
  column.accessor("updated", { header: "Updated" }),
];

function rowId(project: ProjectRow) {
  return project.id;
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge variant={status === "active" ? "default" : "secondary"}>
      {PROJECT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function VisibilityLabel({
  visibility,
}: {
  visibility: ProjectVisibility;
}) {
  const Icon = visibility === "private" ? Lock : Globe;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Icon aria-hidden className="size-3.5" />
      {VISIBILITY_LABELS[visibility]}
    </span>
  );
}

export function ProjectsTable({
  projects,
  emptyTitle,
  emptyDescription,
}: {
  projects: ProjectRow[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <DataTable
      caption="Projects"
      columns={columns}
      data={projects}
      getRowId={rowId}
      emptyState={
        <EmptyState
          icon={FolderKanban}
          title={emptyTitle}
          description={emptyDescription}
          className="border-none"
        />
      }
    />
  );
}
