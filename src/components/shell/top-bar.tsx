import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

import { AppBreadcrumbs } from "./app-breadcrumbs";
import { ThemeToggle } from "./theme-toggle";

/** The workspace top bar: sidebar toggle, breadcrumbs and theme. */
export function TopBar({
  workspace,
}: {
  workspace: { slug: string; name: string };
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-1 data-[orientation=vertical]:h-4"
      />
      <AppBreadcrumbs workspace={workspace} />
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  );
}
