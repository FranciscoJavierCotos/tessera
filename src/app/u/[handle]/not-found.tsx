import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ProfileNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Profile not found</h1>
        <p className="text-sm text-muted-foreground">
          There is no one with this handle, or you do not share a workspace with
          them.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/w">Back to your workspaces</Link>
      </Button>
    </main>
  );
}
