import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function WorkspaceNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Workspace not found</h1>
        <p className="text-sm text-muted-foreground">
          There is no workspace at this address, or you are not a member of it.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/w?all=1">Back to your workspaces</Link>
      </Button>
    </main>
  );
}
