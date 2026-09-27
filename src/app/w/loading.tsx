import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspacesLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading workspaces"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-24"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-18" />
        <Skeleton className="h-18" />
      </div>
    </main>
  );
}
