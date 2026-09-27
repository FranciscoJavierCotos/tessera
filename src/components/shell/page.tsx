import { cn } from "@/lib/utils";

/** The padded, width-capped column every workspace page renders into. */
export function Page({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "narrow" }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-1 flex-col gap-8 px-6 py-8",
        size === "narrow" ? "max-w-3xl" : "max-w-6xl",
        className,
      )}
      {...props}
    />
  );
}
