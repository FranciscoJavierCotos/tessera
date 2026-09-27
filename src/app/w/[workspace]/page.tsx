import { Settings, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/workspace/roles";
import { getMyWorkspace } from "@/lib/workspace/server";

export async function generateMetadata({
  params,
}: PageProps<"/w/[workspace]">): Promise<Metadata> {
  const workspace = await getMyWorkspace((await params).workspace);
  return { title: `${workspace?.name ?? "Workspace"} · Tessera` };
}

/** Workspace home. Placeholder until the app shell (F08) adds its sections. */
export default async function WorkspaceHomePage({
  params,
}: PageProps<"/w/[workspace]">) {
  const workspace = await getMyWorkspace((await params).workspace);
  if (!workspace) notFound();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {workspace.name}
        </h1>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          You are
          <Badge variant="secondary">{ROLE_LABELS[workspace.role]}</Badge>
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href={`/w/${workspace.slug}/settings/members`}
          className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users aria-hidden className="size-4" />
                <h2>Members</h2>
              </CardTitle>
              <CardDescription>
                See who is in the workspace, invite people and manage roles.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-muted-foreground">
              <Settings aria-hidden className="size-4" />
              <h2>More coming soon</h2>
            </CardTitle>
            <CardDescription>
              Projects, the catalog and docs arrive with the app shell.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </main>
  );
}
