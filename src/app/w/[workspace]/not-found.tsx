"use client";

import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Page } from "@/components/shell/page";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { workspaceHome } from "@/lib/workspace/paths";

/** A missing page inside a workspace: the shell stays, so the user can move on. */
export default function WorkspacePageNotFound() {
  const { workspace } = useParams<{ workspace: string }>();

  return (
    <Page size="narrow">
      <PageHeader title="Page not found" />
      <EmptyState
        icon={FileQuestion}
        title="There is nothing at this address"
        description="The link may be broken, or the page was moved or deleted."
        action={
          <Button asChild variant="outline">
            <Link href={workspaceHome(workspace)}>
              Go to the workspace home
            </Link>
          </Button>
        }
      />
    </Page>
  );
}
