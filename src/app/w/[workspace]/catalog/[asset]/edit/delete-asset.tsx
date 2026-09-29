"use client";

import { CircleAlert, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { deleteAsset } from "../../actions";

/** Removes an asset from the catalog (owner or workspace admin). */
export function DeleteAsset({
  assetId,
  assetName,
  workspaceSlug,
}: {
  assetId: string;
  assetName: string;
  workspaceSlug: string;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const remove = () => {
    setError(undefined);
    startTransition(async () => {
      // Redirects to the catalog on success.
      const result = await deleteAsset({ assetId, workspaceSlug });
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <section
      aria-labelledby="delete-heading"
      className="flex flex-col gap-3 rounded-xl border border-destructive/30 p-4"
    >
      <h2 id="delete-heading" className="text-base font-semibold">
        Delete asset
      </h2>
      <p className="text-sm text-muted-foreground">
        Removes the asset, its columns and its project links. This cannot be
        undone.
      </p>
      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertTitle>Could not delete the asset</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div>
        <ConfirmDialog
          destructive
          title={`Delete ${assetName}?`}
          description="Its columns and project links are removed too. This cannot be undone."
          confirmLabel="Delete asset"
          onConfirm={remove}
          trigger={
            <Button variant="destructive" disabled={pending}>
              <Trash2 aria-hidden />
              Delete asset
            </Button>
          }
        />
      </div>
    </section>
  );
}
