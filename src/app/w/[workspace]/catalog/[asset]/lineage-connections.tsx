"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ASSET_KIND_ICONS } from "@/components/asset/asset-badges";
import { ConfirmButton } from "@/components/confirm-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { assetPath } from "@/lib/asset/paths";
import {
  EDGE_SOURCE_LABELS,
  RELATION_LABELS,
  type Connection,
} from "@/lib/lineage/lineage";

import { removeAssetEdge } from "../lineage-actions";

/** The asset's direct upstream and downstream connections, as lists. */
export function LineageConnections({
  assetName,
  workspaceSlug,
  upstream,
  downstream,
  canEdit,
}: {
  assetName: string;
  workspaceSlug: string;
  upstream: Connection[];
  downstream: Connection[];
  canEdit: boolean;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const remove = (connection: Connection) => {
    setError(undefined);
    startTransition(async () => {
      const result = await removeAssetEdge({ edgeId: connection.edgeId });
      if (result.ok)
        toast.success(`Removed the link to ${connection.node.name}`);
      else setError(result.message);
    });
  };

  const list = (
    id: string,
    title: string,
    connections: Connection[],
    empty: string,
  ) => (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <h3 id={id} className="text-sm font-semibold">
        {title}
      </h3>
      {connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul
          className="flex flex-col divide-y rounded-xl border"
          aria-busy={pending}
        >
          {connections.map((c) => {
            const Icon = ASSET_KIND_ICONS[c.node.kind];
            return (
              <li key={c.edgeId} className="flex items-center gap-2 p-2 pl-3">
                <Icon
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <Link
                  href={`${assetPath(workspaceSlug, c.node.qualifiedName)}?tab=lineage`}
                  className="min-w-0 flex-1 truncate rounded-sm text-sm underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {c.node.name}
                </Link>
                <Badge variant="outline">{RELATION_LABELS[c.relation]}</Badge>
                {c.source !== "manual" && (
                  <Badge variant="secondary">
                    {EDGE_SOURCE_LABELS[c.source]}
                  </Badge>
                )}
                {canEdit && c.source === "manual" && (
                  <ConfirmButton
                    label="Remove"
                    accessibleLabel={`Remove the link to ${c.node.name}`}
                    title={`Remove the link to ${c.node.name}?`}
                    description={`Both assets stay in the catalog; only this ${assetName} ↔ ${c.node.name} connection goes.`}
                    confirmLabel="Remove"
                    disabled={pending}
                    onConfirm={() => remove(c)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertTitle>Could not remove the connection</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        {list(
          "upstream-heading",
          `Upstream (${upstream.length})`,
          upstream,
          "Nothing feeds this asset yet.",
        )}
        {list(
          "downstream-heading",
          `Downstream (${downstream.length})`,
          downstream,
          "Nothing reads from this asset yet.",
        )}
      </div>
    </div>
  );
}
