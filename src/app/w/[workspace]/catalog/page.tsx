import { ChevronLeft, ChevronRight, Database, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Page } from "@/components/shell/page";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { canEditAssets } from "@/lib/asset/kinds";
import { assetPath } from "@/lib/asset/paths";
import {
  catalogSearch,
  CATALOG_PAGE_SIZE,
  hasCatalogFilters,
  parseCatalogQuery,
} from "@/lib/asset/schema";
import { listMemberOptions } from "@/lib/asset/server";
import { requireUser } from "@/lib/profile/server";
import { workspaceMetadata } from "@/lib/workspace/metadata";
import { workspacePath } from "@/lib/workspace/paths";
import { getMyWorkspace } from "@/lib/workspace/server";

import { CatalogFilters } from "./catalog-filters";
import { CatalogTable } from "./catalog-table";

export const generateMetadata = workspaceMetadata("Catalog");

/** `YYYY-MM-DD` in UTC (stable across server and client). */
function day(timestamp: string) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** The asset catalog: filter, sort and page through the workspace's assets. */
export default async function CatalogPage({
  params,
  searchParams,
}: PageProps<"/w/[workspace]/catalog">) {
  const workspace = await getMyWorkspace((await params).workspace);
  if (!workspace) notFound();
  const query = parseCatalogQuery(await searchParams);
  const basePath = workspacePath(workspace.slug, "catalog");

  const { supabase } = await requireUser();
  const [total, tagRows, projects, owners] = await Promise.all([
    supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
    supabase
      .from("assets")
      .select("tags")
      .eq("workspace_id", workspace.id)
      .limit(1000),
    supabase
      .from("projects")
      .select("id, slug, entities(title)")
      .eq("workspace_id", workspace.id)
      .is("archived_at", null)
      .order("slug"),
    listMemberOptions(workspace.id),
  ]);
  if (total.error || tagRows.error || projects.error) {
    throw new Error("Could not load the catalog.");
  }

  const projectId = query.project
    ? (projects.data.find((p) => p.slug === query.project)?.id ?? null)
    : null;

  let assets = supabase
    .from("catalog_assets")
    .select(
      "id, name, qualified_name, kind, owner_name, owner_handle, tags, column_count, pii_column_count, updated_at",
      { count: "exact" },
    )
    .eq("workspace_id", workspace.id);
  if (query.kind) assets = assets.eq("kind", query.kind);
  if (query.owner) assets = assets.eq("owner_id", query.owner);
  if (query.tag) assets = assets.contains("tags", [query.tag]);
  if (query.project) {
    // An unknown or hidden project matches nothing.
    assets = projectId
      ? assets.contains("project_ids", [projectId])
      : assets.eq("id", "00000000-0000-0000-0000-000000000000");
  }
  if (query.sort === "name") {
    assets = assets.order("name").order("qualified_name");
  } else if (query.sort === "kind") {
    assets = assets.order("kind").order("name");
  } else {
    assets = assets.order("updated_at", { ascending: false }).order("name");
  }
  const from = (query.page - 1) * CATALOG_PAGE_SIZE;
  const page = await assets.range(from, from + CATALOG_PAGE_SIZE - 1);
  // Past the last page PostgREST answers 416; treat it as an empty page.
  if (page.error && page.error.code !== "PGRST103") {
    throw new Error("Could not load the catalog.");
  }

  const canCreate = canEditAssets(workspace.role);
  const newAssetHref = workspacePath(workspace.slug, "catalog", "new");
  const header = (
    <PageHeader
      title="Catalog"
      description="Every dataset, dashboard, source system and model the team owns."
      actions={
        canCreate && (
          <Button asChild>
            <Link href={newAssetHref}>
              <Plus aria-hidden />
              Add asset
            </Link>
          </Button>
        )
      }
    />
  );

  if (!total.count) {
    return (
      <Page>
        {header}
        <EmptyState
          icon={Database}
          title="The catalog is empty"
          description={
            canCreate
              ? "Register the team's datasets, dashboards, source systems and models so everyone knows what exists and who owns it."
              : "Datasets, dashboards and other assets the team registers will be listed here."
          }
          action={
            canCreate && (
              <Button asChild variant="outline">
                <Link href={newAssetHref}>
                  <Plus aria-hidden />
                  Add the first asset
                </Link>
              </Button>
            )
          }
        />
      </Page>
    );
  }

  const tags = [...new Set(tagRows.data.flatMap((row) => row.tags))].sort();
  const rows = (page.data ?? []).flatMap((asset) =>
    asset.id && asset.qualified_name && asset.kind
      ? [
          {
            id: asset.id,
            name: asset.name ?? asset.qualified_name,
            qualifiedName: asset.qualified_name,
            href: assetPath(workspace.slug, asset.qualified_name),
            kind: asset.kind,
            owner:
              asset.owner_name ??
              (asset.owner_handle ? `@${asset.owner_handle}` : null),
            tags: asset.tags ?? [],
            columns:
              asset.kind === "dataset" ? (asset.column_count ?? 0) : null,
            piiColumns: asset.pii_column_count ?? 0,
            updated: asset.updated_at ? day(asset.updated_at) : "",
          },
        ]
      : [],
  );
  const count = page.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / CATALOG_PAGE_SIZE));
  const filtered = hasCatalogFilters(query);

  return (
    <Page>
      {header}
      <div className="flex flex-col gap-4">
        <CatalogFilters
          basePath={basePath}
          query={query}
          owners={owners.map((o) => ({ value: o.userId, label: o.label }))}
          tags={tags}
          projects={projects.data.map((p) => ({
            value: p.slug,
            label: p.entities?.title ?? p.slug,
          }))}
        />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {count} {count === 1 ? "asset" : "assets"}
          {filtered ? " match" : ""}
        </p>
        <CatalogTable
          assets={rows}
          emptyTitle={
            filtered
              ? "No assets match these filters"
              : "No assets on this page"
          }
          emptyDescription={
            filtered ? "Try other filters or clear them." : "Go back a page."
          }
        />
        {pages > 1 && (
          <nav
            aria-label="Catalog pages"
            className="flex items-center justify-between gap-3"
          >
            <PageLink
              href={`${basePath}${catalogSearch({ ...query, page: query.page - 1 })}`}
              disabled={query.page <= 1}
            >
              <ChevronLeft aria-hidden />
              Previous
            </PageLink>
            <span className="text-sm text-muted-foreground">
              Page {Math.min(query.page, pages)} of {pages}
            </span>
            <PageLink
              href={`${basePath}${catalogSearch({ ...query, page: query.page + 1 })}`}
              disabled={query.page >= pages}
            >
              Next
              <ChevronRight aria-hidden />
            </PageLink>
          </nav>
        )}
      </div>
    </Page>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>{children}</Link>
    </Button>
  );
}
