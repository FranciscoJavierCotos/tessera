import { FolderKanban } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Page } from "@/components/shell/page";
import { EmptyState } from "@/components/states/empty-state";
import { workspaceMetadata } from "@/lib/workspace/metadata";

export const generateMetadata = workspaceMetadata("Projects");

/** Projects list. Creating projects arrives with C01. */
export default function ProjectsPage() {
  return (
    <Page>
      <PageHeader
        title="Projects"
        description="The team's units of work, with their members, assets and docs."
      />
      <EmptyState
        icon={FolderKanban}
        title="No projects yet"
        description="Projects group the people, datasets and docs behind a piece of work. You will be able to create them soon."
      />
    </Page>
  );
}
