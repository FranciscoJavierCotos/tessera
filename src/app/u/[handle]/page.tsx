import { Boxes, ExternalLink, History, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { KindBadge } from "@/components/asset/asset-badges";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { assetPath } from "@/lib/asset/paths";
import { DISCIPLINE_LABELS, parseLinks } from "@/lib/profile/schema";
import { avatarUrl } from "@/lib/profile/server";
import { listMyWorkspaces } from "@/lib/workspace/server";

import { loadProfile } from "./profile-data";

export async function generateMetadata({
  params,
}: PageProps<"/u/[handle]">): Promise<Metadata> {
  const { profile } = await loadProfile((await params).handle);
  return {
    title: profile
      ? `${profile.display_name ?? profile.handle} (@${profile.handle}) · Tessera`
      : "Profile not found · Tessera",
  };
}

export default async function ProfilePage({
  params,
}: PageProps<"/u/[handle]">) {
  const { supabase, userId, profile } = await loadProfile(
    (await params).handle,
  );
  if (!profile?.handle) notFound();

  const isOwner = profile.id === userId;
  const links = parseLinks(profile.links);
  const [avatar, viewer, workspaces, owned] = await Promise.all([
    avatarUrl(supabase, profile.avatar_path),
    isOwner
      ? { handle: profile.handle }
      : supabase
          .from("profiles")
          .select("handle")
          .eq("id", userId)
          .maybeSingle()
          .then(({ data }) => data),
    listMyWorkspaces(),
    // RLS limits this to workspaces the viewer shares with the profile.
    supabase
      .from("catalog_assets")
      .select("id, name, qualified_name, kind, workspace_id")
      .eq("owner_id", profile.id)
      .order("updated_at", { ascending: false })
      .limit(OWNED_ASSETS_LIMIT),
  ]);
  if (owned.error) throw new Error("Could not load the owned assets.");
  const workspaceSlugs = new Map(workspaces.map((w) => [w.id, w.slug]));
  const ownedAssets = owned.data.flatMap((asset) => {
    const slug = asset.workspace_id && workspaceSlugs.get(asset.workspace_id);
    return slug && asset.id && asset.qualified_name && asset.kind
      ? [
          {
            id: asset.id,
            name: asset.name ?? asset.qualified_name,
            kind: asset.kind,
            href: assetPath(slug, asset.qualified_name),
          },
        ]
      : [];
  });

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader handle={viewer?.handle} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
        <section
          aria-labelledby="profile-name"
          className="flex flex-col gap-6 sm:flex-row sm:items-start"
        >
          <ProfileAvatar name={profile.display_name} src={avatar} />
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h1
                  id="profile-name"
                  className="text-2xl font-semibold tracking-tight"
                >
                  {profile.display_name}
                </h1>
                <p className="text-muted-foreground">@{profile.handle}</p>
              </div>
              {isOwner && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/u/${profile.handle}/edit`}>
                    <Pencil aria-hidden />
                    Edit profile
                  </Link>
                </Button>
              )}
            </div>
            {profile.discipline && (
              <Badge variant="secondary">
                {DISCIPLINE_LABELS[profile.discipline]}
              </Badge>
            )}
            {profile.bio ? (
              <p className="max-w-prose whitespace-pre-line">{profile.bio}</p>
            ) : (
              isOwner && (
                <p className="text-sm text-muted-foreground">
                  Add a short bio so your team knows what you work on.
                </p>
              )
            )}
            {profile.skills.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">Skills</h2>
                <ul className="flex flex-wrap gap-1.5">
                  {profile.skills.map((skill) => (
                    <li key={skill}>
                      <Badge variant="outline">{skill}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {links.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">Links</h2>
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {links.map((link) => (
                    <li key={link.url}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex items-center gap-1 rounded-sm text-sm underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {link.label}
                        <ExternalLink aria-hidden className="size-3.5" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <PlaceholderCard
            icon={<Boxes aria-hidden className="size-5" />}
            title="Owned assets"
            description="Datasets, dashboards and models this person owns."
            empty="Nothing here yet. Assets this person owns in the catalog appear here."
          >
            {ownedAssets.length > 0 && (
              <ul className="flex flex-col divide-y">
                {ownedAssets.map((asset) => (
                  <li
                    key={asset.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <Link
                      href={asset.href}
                      className="min-w-0 truncate rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {asset.name}
                    </Link>
                    <KindBadge kind={asset.kind} />
                  </li>
                ))}
              </ul>
            )}
          </PlaceholderCard>
          <PlaceholderCard
            icon={<History aria-hidden className="size-5" />}
            title="Recent activity"
            description="What this person has been working on."
            empty="No activity yet. Updates appear here as the team works."
          />
        </div>
      </main>
    </div>
  );
}

const OWNED_ASSETS_LIMIT = 10;

/** A card with a list, or a dashed empty state when `children` is empty. */
function PlaceholderCard({
  icon,
  title,
  description,
  empty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  empty: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {children || (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {icon}
            <p>{empty}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
