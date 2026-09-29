import {
  Columns3,
  ExternalLink,
  FileText,
  GitFork,
  MessagesSquare,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { KindBadge, PiiBadge, TagList } from "@/components/asset/asset-badges";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { Page } from "@/components/shell/page";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canEditAssets, DASHBOARD_TOOL_LABELS } from "@/lib/asset/kinds";
import { assetPath } from "@/lib/asset/paths";
import { getAsset, getDatasetColumns, type Asset } from "@/lib/asset/server";
import { requireUser } from "@/lib/profile/server";
import { projectPath } from "@/lib/project/paths";
import { canEditProject } from "@/lib/project/roles";
import { cn } from "@/lib/utils";
import { getMyWorkspace, type MyWorkspace } from "@/lib/workspace/server";

import { AssetProjects } from "./asset-projects";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "columns", label: "Columns" },
  { id: "lineage", label: "Lineage" },
  { id: "docs", label: "Docs & mentions" },
  { id: "discussion", label: "Discussion" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export async function generateMetadata({
  params,
}: PageProps<"/w/[workspace]/catalog/[asset]">) {
  const { workspace: slug, asset: qualifiedName } = await params;
  const workspace = await getMyWorkspace(slug);
  const asset = workspace && (await getAsset(workspace.id, qualifiedName));
  const parts = [asset?.name ?? "Asset", workspace?.name, "Tessera"];
  return { title: parts.filter(Boolean).join(" · ") };
}

/** An asset's page: overview, columns (datasets) and later-feature tabs. */
export default async function AssetPage({
  params,
  searchParams,
}: PageProps<"/w/[workspace]/catalog/[asset]">) {
  const { workspace: slug, asset: qualifiedName } = await params;
  const workspace = await getMyWorkspace(slug);
  if (!workspace) notFound();
  const asset = await getAsset(workspace.id, qualifiedName);
  if (!asset) notFound();

  const tabs = TABS.filter(
    (t) => t.id !== "columns" || asset.kind === "dataset",
  );
  const requested = (await searchParams).tab;
  const tab: TabId = tabs.find((t) => t.id === requested)?.id ?? "overview";
  const href = assetPath(workspace.slug, asset.qualifiedName);
  const canEdit = canEditAssets(workspace.role);

  return (
    <Page>
      <PageHeader
        title={asset.name}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <KindBadge kind={asset.kind} />
            <span className="font-mono text-xs">{asset.qualifiedName}</span>
          </span>
        }
        actions={
          canEdit && (
            <Button asChild variant="outline">
              <Link
                href={assetPath(workspace.slug, asset.qualifiedName, "edit")}
              >
                <Pencil aria-hidden />
                Edit asset
              </Link>
            </Button>
          )
        }
      />

      <nav aria-label="Asset sections" className="-mt-2 border-b">
        <ul className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <li key={t.id}>
              <Link
                href={t.id === "overview" ? href : `${href}?tab=${t.id}`}
                aria-current={t.id === tab ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-9 items-center border-b-2 border-transparent px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  t.id === tab && "border-primary font-medium text-foreground",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "overview" && <Overview asset={asset} workspace={workspace} />}
      {tab === "columns" && <Columns assetId={asset.id} />}
      {tab === "lineage" && (
        <EmptyState
          icon={GitFork}
          title="Lineage is on its way"
          description="Upstream and downstream assets will be drawn here."
        />
      )}
      {tab === "docs" && (
        <EmptyState
          icon={FileText}
          title="No docs mention this asset yet"
          description="Pages that mention it will be listed here."
        />
      )}
      {tab === "discussion" && (
        <EmptyState
          icon={MessagesSquare}
          title="No discussion yet"
          description="Comments on this asset and its columns will live here."
        />
      )}
    </Page>
  );
}

async function Overview({
  asset,
  workspace,
}: {
  asset: Asset;
  workspace: MyWorkspace;
}) {
  const { supabase, userId } = await requireUser();
  const [links, projects, memberships] = await Promise.all([
    supabase
      .from("project_assets")
      .select("project_id, projects(slug, entities(title))")
      .eq("asset_id", asset.id)
      .order("added_at"),
    supabase
      .from("projects")
      .select("id, slug, entities(title)")
      .eq("workspace_id", workspace.id)
      .is("archived_at", null)
      .order("slug"),
    supabase
      .from("project_members")
      .select("project_id, role")
      .eq("workspace_id", workspace.id)
      .eq("user_id", userId),
  ]);
  if (links.error || projects.error || memberships.error) {
    throw new Error("Could not load the asset's projects.");
  }

  const myRoles = new Map(memberships.data.map((m) => [m.project_id, m.role]));
  const canEditIn = (projectId: string) =>
    canEditProject(workspace.role, myRoles.get(projectId) ?? null);
  const linkedIds = new Set(links.data.map((l) => l.project_id));
  const linked = links.data.flatMap((link) =>
    link.projects
      ? [
          {
            id: link.project_id,
            name: link.projects.entities?.title ?? link.projects.slug,
            href: projectPath(workspace.slug, link.projects.slug),
            canUnlink: canEditIn(link.project_id),
          },
        ]
      : [],
  );
  const linkable = projects.data
    .filter((p) => !linkedIds.has(p.id) && canEditIn(p.id))
    .map((p) => ({ id: p.id, name: p.entities?.title ?? p.slug }));

  const { url, tool, system, framework } = asset.properties;
  const details: { label: string; value: React.ReactNode }[] = [
    {
      label: "Owner",
      value: asset.owner?.handle ? (
        <Link
          href={`/u/${asset.owner.handle}`}
          className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {asset.owner.name ?? `@${asset.owner.handle}`}
        </Link>
      ) : (
        (asset.owner?.name ?? "Former member")
      ),
    },
    ...(tool ? [{ label: "Tool", value: DASHBOARD_TOOL_LABELS[tool] }] : []),
    ...(system ? [{ label: "System", value: system }] : []),
    ...(framework ? [{ label: "Framework", value: framework }] : []),
    ...(url
      ? [
          {
            label: "Link",
            value: (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex max-w-full items-center gap-1 rounded-sm break-all underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {url}
                <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ),
          },
        ]
      : []),
    {
      label: "Updated",
      value: new Date(asset.updatedAt).toISOString().slice(0, 10),
    },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section
        aria-labelledby="description-heading"
        className="flex min-w-0 flex-col gap-3"
      >
        <h2 id="description-heading" className="text-base font-semibold">
          Description
        </h2>
        {asset.description ? (
          <Markdown>{asset.description}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">No description yet.</p>
        )}
      </section>

      <aside className="flex flex-col gap-6" aria-label="Asset details">
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          {details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className="min-w-0">{d.value}</dd>
            </div>
          ))}
          {asset.tags.length > 0 && (
            <div className="contents">
              <dt className="text-muted-foreground">Tags</dt>
              <dd>
                <TagList tags={asset.tags} />
              </dd>
            </div>
          )}
        </dl>
        <AssetProjects
          assetId={asset.id}
          assetName={asset.name}
          workspaceId={workspace.id}
          linked={linked}
          linkable={linkable}
        />
      </aside>
    </div>
  );
}

async function Columns({ assetId }: { assetId: string }) {
  const columns = await getDatasetColumns(assetId);
  if (columns.length === 0) {
    return (
      <EmptyState
        icon={Columns3}
        title="No columns documented"
        description="Add the dataset's columns from Edit asset."
      />
    );
  }
  const pii = columns.filter((c) => c.isPii).length;

  return (
    <section aria-labelledby="columns-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="columns-heading" className="text-base font-semibold">
          {columns.length} {columns.length === 1 ? "column" : "columns"}
        </h2>
        {pii > 0 && <PiiBadge count={pii} />}
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableCaption className="sr-only">Dataset columns</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 px-3">#</TableHead>
              <TableHead className="px-3">Name</TableHead>
              <TableHead className="px-3">Type</TableHead>
              <TableHead className="px-3">Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {columns.map((column, index) => (
              <TableRow key={column.id}>
                <TableCell className="px-3 text-muted-foreground">
                  {index + 1}
                </TableCell>
                <TableCell className="px-3">
                  <span className="inline-flex items-center gap-2">
                    <span className="font-mono">{column.name}</span>
                    {column.isPii && <PiiBadge />}
                  </span>
                </TableCell>
                <TableCell className="px-3 font-mono text-muted-foreground">
                  {column.dataType || "—"}
                </TableCell>
                <TableCell className="px-3 whitespace-normal">
                  {column.description || (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
