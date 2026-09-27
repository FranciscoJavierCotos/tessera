import { Skeleton } from "@/components/ui/skeleton";

export default function MembersLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading members"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-24" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-15" />
        <Skeleton className="h-15" />
        <Skeleton className="h-15" />
      </div>
    </main>
  );
}
