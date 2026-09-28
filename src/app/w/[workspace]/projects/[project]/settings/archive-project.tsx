"use client";

import { Archive, ArchiveRestore, CircleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { setProjectArchived } from "../../actions";

/** Archive (with confirmation) or restore a project. Leads only. */
export function ArchiveProject({
  projectId,
  archived,
}: {
  projectId: string;
  archived: boolean;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const toggle = (next: boolean) => {
    setError(undefined);
    startTransition(async () => {
      const result = await setProjectArchived({ projectId, archived: next });
      if (result.ok) {
        toast.success(next ? "Project archived" : "Project restored");
      } else setError(result.message);
    });
  };

  return (
    <section
      aria-labelledby="archive-heading"
      className="flex flex-col gap-3 rounded-xl border p-4"
    >
      <h2 id="archive-heading" className="text-base font-semibold">
        {archived ? "Restore project" : "Archive project"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {archived
          ? "Restoring puts the project back in the projects list."
          : "Archived projects leave the projects list but keep their members and content. You can restore it later."}
      </p>
      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertTitle>Could not update the project</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div>
        {archived ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => toggle(false)}
          >
            <ArchiveRestore aria-hidden />
            Restore project
          </Button>
        ) : (
          <ConfirmDialog
            destructive
            title="Archive this project?"
            description="It leaves the projects list. Members keep access and you can restore it."
            confirmLabel="Archive project"
            onConfirm={() => toggle(true)}
            trigger={
              <Button variant="outline" disabled={pending}>
                <Archive aria-hidden />
                Archive project
              </Button>
            }
          />
        )}
      </div>
    </section>
  );
}
