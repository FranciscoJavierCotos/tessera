import { SlidersHorizontal, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Page } from "@/components/shell/page";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { workspaceMetadata } from "@/lib/workspace/metadata";
import { workspacePath } from "@/lib/workspace/paths";
import { getMyWorkspace } from "@/lib/workspace/server";

export const generateMetadata = workspaceMetadata("Settings");

/** Workspace settings. General settings (name, slug) come later. */
export default async function SettingsPage({
  params,
}: PageProps<"/w/[workspace]/settings">) {
  const workspace = await getMyWorkspace((await params).workspace);
  if (!workspace) notFound();

  return (
    <Page size="narrow">
      <PageHeader
        title="Settings"
        description={`How ${workspace.name} is set up and who can use it.`}
      />
      <EmptyState
        icon={SlidersHorizontal}
        title="No general settings yet"
        description="Renaming the workspace and other options are coming. Members and invites are ready."
        action={
          <Button asChild variant="outline">
            <Link href={workspacePath(workspace.slug, "settings", "members")}>
              <Users aria-hidden />
              Manage members
            </Link>
          </Button>
        }
      />
    </Page>
  );
}
