import { BookOpen } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Page } from "@/components/shell/page";
import { EmptyState } from "@/components/states/empty-state";
import { workspaceMetadata } from "@/lib/workspace/metadata";

export const generateMetadata = workspaceMetadata("Docs");

/** Docs index. Pages and the editor arrive with C04. */
export default function DocsPage() {
  return (
    <Page>
      <PageHeader
        title="Docs"
        description="Runbooks, specs and notes that link to your data assets."
      />
      <EmptyState
        icon={BookOpen}
        title="No docs yet"
        description="Write pages that mention datasets, projects and people. The editor is on its way."
      />
    </Page>
  );
}
