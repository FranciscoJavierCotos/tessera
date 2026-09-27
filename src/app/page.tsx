import {
  GitBranch,
  Network,
  ShieldCheck,
  Plug,
  Siren,
  Workflow,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const highlights = [
  {
    icon: Network,
    title: "Catalog & lineage",
    body: "dbt-import first, with owners and the people who know each asset.",
  },
  {
    icon: Siren,
    title: "Test → incident → postmortem",
    body: "A failing quality test becomes an incident, a postmortem, and action items in one flow.",
  },
  {
    icon: GitBranch,
    title: "Impact analysis",
    body: "If I change this column, what breaks, and who must I tell?",
  },
  {
    icon: Workflow,
    title: "ERD proposals",
    body: "Versioned model changes with visual diff, review, and drift detection.",
  },
  {
    icon: ShieldCheck,
    title: "Decisions linked to data",
    body: "ADRs and RFCs attached to the assets they affect.",
  },
  {
    icon: Plug,
    title: "Integrate, don't replace",
    body: "Tessera never runs your pipelines. It receives their results.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
          <span className="font-semibold tracking-tight">Tessera</span>
          <Button asChild variant="outline" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-6 py-20">
        <section className="flex max-w-2xl flex-col gap-6">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Tessera: one graph for your data team
          </h1>
          <p className="text-lg text-pretty text-muted-foreground">
            Catalog, lineage, data-quality tests, pipelines, incidents, data
            models, architecture decisions, and docs, joined through{" "}
            <code className="font-mono">@mentions</code> and backlinks. The
            context stops living in people&apos;s heads.
          </p>
          <div>
            <Button asChild size="lg">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        </section>

        <section
          aria-labelledby="highlights-heading"
          className="flex flex-col gap-6"
        >
          <h2
            id="highlights-heading"
            className="text-sm font-medium text-muted-foreground"
          >
            What it brings together
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {highlights.map(({ icon: Icon, title, body }) => (
              <li
                key={title}
                className="flex flex-col gap-2 rounded-lg border bg-card p-5"
              >
                <Icon aria-hidden className="size-5 text-muted-foreground" />
                <h3 className="font-medium">{title}</h3>
                <p className="text-sm text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto w-full max-w-5xl px-6 py-6 text-sm text-muted-foreground">
          Pre-alpha · Apache-2.0
        </div>
      </footer>
    </div>
  );
}
