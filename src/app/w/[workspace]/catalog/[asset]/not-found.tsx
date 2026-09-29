"use client";

import { SearchX } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Page } from "@/components/shell/page";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { workspacePath } from "@/lib/workspace/paths";

/** An asset that does not exist or that the user cannot see. */
export default function AssetNotFound() {
  const { workspace } = useParams<{ workspace: string }>();

  return (
    <Page size="narrow">
      <PageHeader title="Asset not found" />
      <EmptyState
        icon={SearchX}
        title="There is no asset at this address"
        description="It may have been renamed or removed from the catalog."
        action={
          <Button asChild variant="outline">
            <Link href={workspacePath(workspace, "catalog")}>
              Go to the catalog
            </Link>
          </Button>
        }
      />
    </Page>
  );
}
