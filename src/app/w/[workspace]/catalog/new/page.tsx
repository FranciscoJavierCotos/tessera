import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Page } from "@/components/shell/page";
import { ASSET_KINDS, canEditAssets } from "@/lib/asset/kinds";
import { listMemberOptions } from "@/lib/asset/server";
import { requireUser } from "@/lib/profile/server";
import { workspaceMetadata } from "@/lib/workspace/metadata";
import { workspacePath } from "@/lib/workspace/paths";
import { getMyWorkspace } from "@/lib/workspace/server";

import { AssetForm } from "../asset-form";

export const generateMetadata = workspaceMetadata("Add an asset");

/** Registers an asset; `?kind=` preselects its kind (dataset by default). */
export default async function NewAssetPage({
  params,
  searchParams,
}: PageProps<"/w/[workspace]/catalog/new">) {
  const workspace = await getMyWorkspace((await params).workspace);
  if (!workspace) notFound();
  const catalogHref = workspacePath(workspace.slug, "catalog");
  if (!canEditAssets(workspace.role)) redirect(catalogHref);

  const requested = (await searchParams).kind;
  const kind = ASSET_KINDS.find((k) => k === requested) ?? "dataset";
  const [{ userId }, owners] = await Promise.all([
    requireUser(),
    listMemberOptions(workspace.id),
  ]);

  return (
    <Page size="narrow">
      <PageHeader
        title="Add an asset"
        description="Register a dataset, dashboard, source system or model so the team can find it and knows who owns it."
      />
      <AssetForm
        workspace={workspace}
        owners={owners}
        cancelHref={catalogHref}
        initial={{
          kind,
          name: "",
          qualifiedName: "",
          description: "",
          ownerId: userId,
          tags: [],
          properties: {},
          columns: [],
        }}
      />
    </Page>
  );
}
