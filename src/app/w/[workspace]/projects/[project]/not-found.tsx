"use client";

import { FolderSearch } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Page } from "@/components/shell/page";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { workspacePath } from "@/lib/workspace/paths";

/**
 * A project that does not exist or that the user cannot see (private
 * projects are hidden from non-members): the same 404 either way.
 */
export default function ProjectNotFound() {
  const { workspace } = useParams<{ workspace: string }>();

  return (
    <Page size="narrow">
      <PageHeader title="Project not found" />
      <EmptyState
        icon={FolderSearch}
        title="There is no project at this address"
        description="It may have been renamed, or it is private and you are not a member."
        action={
          <Button asChild variant="outline">
            <Link href={workspacePath(workspace, "projects")}>
              Go to projects
            </Link>
          </Button>
        }
      />
    </Page>
  );
}
