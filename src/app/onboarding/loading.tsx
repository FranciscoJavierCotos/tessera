import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading onboarding"
      className="flex flex-1 items-center justify-center px-6 py-16"
    >
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-xl border p-6">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="ml-auto h-9 w-24" />
      </div>
    </main>
  );
}
