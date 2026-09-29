"use client";

import { CircleAlert, Database } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { KindBadge } from "@/components/asset/asset-badges";
import { ConfirmButton } from "@/components/confirm-button";
import { EmptyState } from "@/components/states/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AssetKind } from "@/lib/asset/kinds";

import { unlinkAssetFromProject } from "../../catalog/actions";

export type LinkedAsset = {
  id: string;
  name: string;
  qualifiedName: string;
  kind: AssetKind;
  href: string;
};

/** The assets linked to a project; project editors unlink them. */
export function LinkedAssets({
  projectId,
  assets,
  canEdit,
  catalogHref,
}: {
  projectId: string;
  assets: LinkedAsset[];
  canEdit: boolean;
  catalogHref: string;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const unlink = (asset: LinkedAsset) => {
    setError(undefined);
    startTransition(async () => {
      const result = await unlinkAssetFromProject({
        assetId: asset.id,
        projectId,
      });
      if (result.ok) toast.success(`${asset.name} was unlinked`);
      else setError(result.message);
    });
  };

  if (assets.length === 0) {
    return (
      <EmptyState
        icon={Database}
        headingLevel={3}
        title="No linked assets"
        description={
          canEdit
            ? "Link datasets, dashboards and models from their page in the catalog."
            : "Datasets, dashboards and models the project uses will be listed here."
        }
        action={
          canEdit && (
            <Button asChild variant="outline">
              <Link href={catalogHref}>Browse the catalog</Link>
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertTitle>Could not unlink the asset</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <ul
        className="flex flex-col divide-y rounded-xl border"
        aria-busy={pending}
      >
        {assets.map((asset) => (
          <li key={asset.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Link
                href={asset.href}
                className="truncate rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {asset.name}
              </Link>
              <span className="truncate font-mono text-xs text-muted-foreground">
                {asset.qualifiedName}
              </span>
            </div>
            <KindBadge kind={asset.kind} />
            {canEdit && (
              <ConfirmButton
                label="Unlink"
                accessibleLabel={`Unlink ${asset.name}`}
                title={`Unlink ${asset.name}?`}
                description="It stays in the catalog; it just leaves this project."
                confirmLabel="Unlink"
                disabled={pending}
                onConfirm={() => unlink(asset)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
