import { Sparkles, UserPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Page } from "@/components/shell/page";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { workspaceMetadata } from "@/lib/workspace/metadata";
import { workspacePath } from "@/lib/workspace/paths";
import { canManageMembers, ROLE_LABELS } from "@/lib/workspace/roles";
import { getMyWorkspace } from "@/lib/workspace/server";

export const generateMetadata = workspaceMetadata("Home");

/** Workspace home. The activity feed and highlights arrive in M1. */
export default async function WorkspaceHomePage({
  params,
}: PageProps<"/w/[workspace]/home">) {
  const workspace = await getMyWorkspace((await params).workspace);
  if (!workspace) notFound();

  return (
    <Page>
      <PageHeader
        title={workspace.name}
        description={
          <span className="flex items-center gap-2">
            You are
            <Badge variant="secondary">{ROLE_LABELS[workspace.role]}</Badge>
          </span>
        }
      />
      <EmptyState
        icon={Sparkles}
        title="Nothing here yet"
        description="Recent activity from projects, the catalog and docs will show up here."
        action={
          canManageMembers(workspace.role) && (
            <Button asChild variant="outline">
              <Link href={workspacePath(workspace.slug, "settings", "members")}>
                <UserPlus aria-hidden />
                Invite teammates
              </Link>
            </Button>
          )
        }
      />
    </Page>
  );
}
