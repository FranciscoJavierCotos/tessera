# Tessera

> A collaborative workspace for data teams: one graph that joins the **people**,
> **knowledge**, and **data assets** of a team.

Data teams use a tool per slice: dbt for models, Airflow for pipelines, Great
Expectations for quality, Notion for docs, Jira for tasks, Slack for "who owns
this table?". None of them knows about the others, so the context lives in
people's heads. Tessera joins them: catalog, lineage, data-quality tests,
pipelines, incidents, data models, architecture decisions, and docs, all linked
through `@mentions` and backlinks.

**Status:** 🚧 pre-alpha. Working on **M0 — Foundations**. See the
[roadmap](docs/roadmap.md) and [milestones](https://github.com/FranciscoJavierCotos/tessera/milestones).

## Highlights (planned)

- **Catalog + lineage**, dbt-import first, with owners and expertise.
- **Failing test → incident → postmortem → action items** in one flow.
- **Impact analysis**: "if I change this column, what breaks and who must I tell?"
- **ERD proposals** with visual diff and review, plus drift detection.
- **ADRs and RFCs** linked to the assets they affect.
- **Integrate, don't replace**: Tessera never runs your pipelines; it receives their results.

## Stack

TypeScript · Next.js 16 (App Router) · Supabase (Postgres, Auth, Realtime,
Storage, RLS) · Tailwind v4 + shadcn/ui · React Flow · Tiptap · Zod · Vitest ·
Playwright · GitHub Actions · Vercel.

## Docs

- [Roadmap (MVP → v1.0)](docs/roadmap.md)
- [Architecture spec](docs/specs/architecture.md)
- [M0 Foundations spec](docs/specs/m0-foundations.md)
- [Contributing](CONTRIBUTING.md)

## Local setup

Prerequisites: **Node 24 LTS** (see `.nvmrc`), **pnpm** (version pinned in
`package.json` → `packageManager`), and Docker Desktop (for the local Supabase
stack, arriving with [F03](https://github.com/FranciscoJavierCotos/tessera/issues/3)).

```bash
pnpm install
cp .env.example .env.local   # then fill in the values
pnpm dev                     # http://localhost:3000
```

The app validates its environment at startup (`src/env.ts`) and exits with a
list of missing or invalid variables.

### Scripts

| Script                         | What it does                                         |
| ------------------------------ | ---------------------------------------------------- |
| `pnpm dev`                     | Dev server                                           |
| `pnpm build` / `pnpm start`    | Production build / serve it                          |
| `pnpm lint`                    | ESLint                                               |
| `pnpm typecheck`               | Generate Next.js route types, then `tsc --noEmit`    |
| `pnpm format` / `format:check` | Prettier write / check                               |
| `pnpm test`                    | Unit tests (Vitest)                                  |
| `pnpm test:e2e`                | End-to-end tests (Playwright; starts the dev server) |

First e2e run: `pnpm exec playwright install chromium`.

## License

[Apache-2.0](LICENSE)
