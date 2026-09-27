import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts.at(-1)] : parts;
  return letters.map((part) => part![0]!.toUpperCase()).join("") || "?";
}

/** A user's avatar image with their initials as the fallback. */
export function ProfileAvatar({
  name,
  src,
  className,
}: {
  name: string | null;
  src: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-20", className)}>
      {src && <AvatarImage src={src} alt="" />}
      <AvatarFallback className="text-xl">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
