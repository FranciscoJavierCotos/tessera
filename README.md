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

Prerequisites: **Node 24 LTS** (see `.nvmrc`) and **pnpm** (version pinned in
`package.json` → `packageManager`). No Docker: the app, tests and CI all use
the Supabase Cloud project `tessera` directly. The Supabase CLI is a dev
dependency; no global install is needed.

```bash
pnpm install
cp .env.example .env.local   # then fill in the keys (Supabase dashboard → API Keys)
pnpm dev                     # http://localhost:3000
```

### Database

The schema lives in `supabase/migrations` (forward-only). To change it:

1. One-time: `pnpm supabase login` and `pnpm db:link` (asks for the DB password).
2. `pnpm supabase migration new <name>` and write the SQL.
3. `pnpm db:push` applies it to the cloud project (or use the Supabase MCP
   `apply_migration`, then rename the file to the version the cloud recorded).
4. `pnpm db:types` regenerates `src/lib/db/types.ts`; commit it with the
   migration. `pnpm db:lint` and the dashboard's Security Advisor must be clean.

Migrations must be backward compatible, because the deployed app and open PRs
share the same database. Row level security is enabled on every table; see the
[architecture spec](docs/specs/architecture.md#4-core-data-model).

`pnpm db:seed` loads `supabase/seed.sql` (idempotent) for manual testing:

| User                 | Workspace | Role   |
| -------------------- | --------- | ------ |
| `alice@tessera.test` | `acme`    | owner  |
| `val@tessera.test`   | `acme`    | viewer |
| `bob@tessera.test`   | `globex`  | owner  |

Password for every seed user: `password123`. Never seed a production project.

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
| `pnpm db:link`                 | Link the Supabase CLI to the cloud project (once)    |
| `pnpm db:push`                 | Apply pending migrations to the cloud project        |
| `pnpm db:types`                | Regenerate `src/lib/db/types.ts` from the cloud DB   |
| `pnpm db:lint`                 | Lint the cloud DB schema (`supabase db lint`)        |
| `pnpm db:seed`                 | Load `supabase/seed.sql` into the cloud project      |

First e2e run: `pnpm exec playwright install chromium`.

## License

[Apache-2.0](LICENSE)
