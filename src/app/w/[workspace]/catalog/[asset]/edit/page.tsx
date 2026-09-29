import { Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Page } from "@/components/shell/page";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { canDeleteAsset, canEditAssets } from "@/lib/asset/kinds";
import { assetPath } from "@/lib/asset/paths";
import {
  getAsset,
  getDatasetColumns,
  listMemberOptions,
} from "@/lib/asset/server";
import { requireUser } from "@/lib/profile/server";
import { getMyWorkspace } from "@/lib/workspace/server";

import { AssetForm } from "../../asset-form";
import { DeleteAsset } from "./delete-asset";

export async function generateMetadata({
  params,
}: PageProps<"/w/[workspace]/catalog/[asset]/edit">) {
  const { workspace: slug, asset: qualifiedName } = await params;
  const workspace = await getMyWorkspace(slug);
  const asset = workspace && (await getAsset(workspace.id, qualifiedName));
  const parts = ["Edit", asset?.name, workspace?.name, "Tessera"];
  return { title: parts.filter(Boolean).join(" · ") };
}

/** Edit an asset's details and columns; its owner or an admin deletes it. */
export default async function EditAssetPage({
  params,
}: PageProps<"/w/[workspace]/catalog/[asset]/edit">) {
  const { workspace: slug, asset: qualifiedName } = await params;
  const workspace = await getMyWorkspace(slug);
  if (!workspace) notFound();
  const asset = await getAsset(workspace.id, qualifiedName);
  if (!asset) notFound();

  const home = assetPath(workspace.slug, asset.qualifiedName);
  if (!canEditAssets(workspace.role)) {
    return (
      <Page size="narrow">
        <PageHeader title="Edit asset" />
        <EmptyState
          icon={Lock}
          title="You can view this asset but not edit it"
          description="Workspace viewers have read-only access. Ask an admin for the member role."
          action={
            <Button asChild variant="outline">
              <Link href={home}>Back to the asset</Link>
            </Button>
          }
        />
      </Page>
    );
  }

  const [{ userId }, owners, columns] = await Promise.all([
    requireUser(),
    listMemberOptions(workspace.id),
    asset.kind === "dataset" ? getDatasetColumns(asset.id) : [],
  ]);
  // An owner who left the workspace stays selectable until replaced.
  const ownerOptions = owners.some((o) => o.userId === asset.ownerId)
    ? owners
    : [
        {
          userId: asset.ownerId,
          label: `${asset.owner?.name ?? "Former member"} (left the workspace)`,
        },
        ...owners,
      ];

  return (
    <Page size="narrow">
      <PageHeader
        title="Edit asset"
        description={`How ${asset.name} is described, who owns it and what it contains.`}
      />
      <AssetForm
        workspace={workspace}
        assetId={asset.id}
        owners={ownerOptions}
        cancelHref={home}
        initial={{
          kind: asset.kind,
          name: asset.name,
          qualifiedName: asset.qualifiedName,
          description: asset.description,
          ownerId: asset.ownerId,
          tags: asset.tags,
          properties: asset.properties,
          columns: columns.map(({ name, dataType, description, isPii }) => ({
            name,
            dataType,
            description,
            isPii,
          })),
        }}
      />
      {canDeleteAsset(workspace.role, asset.ownerId, userId) && (
        <DeleteAsset
          assetId={asset.id}
          assetName={asset.name}
          workspaceSlug={workspace.slug}
        />
      )}
    </Page>
  );
}
