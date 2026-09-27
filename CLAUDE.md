# CLAUDE.md — Tessera

@AGENTS.md

Collaborative workspace for data teams (catalog, lineage, quality, incidents,
modeling, ADRs, docs) joined by one entity graph. Portfolio project first,
open source later.

## Source of truth

- Plan: `docs/roadmap.md` (every story ID like `F03`, `C05` = one GitHub issue)
- Architecture & conventions: `docs/specs/architecture.md`
- Current milestone spec: `docs/specs/m0-foundations.md`
- GitHub: `FranciscoJavierCotos/tessera` · Supabase Cloud project `tessera`
  (ref `ijhtgvmcyrzmkmfiavnu`, region `eu-west-3`)

## Workflow

- Never push to `main`. Issue → branch `<type>/<issue>-<slug>` → PR with `Closes #n`.
- Conventional Commits (`feat(scope): …`, `fix`, `chore`, `docs`, `test`, `ci`, `refactor`).
- Squash merge only; CI must be green.
- Work one story (issue) per PR; respect the `Depends on` order in the roadmap.

## Commands

- `pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm format:check`
- `pnpm test` (Vitest unit) · `pnpm test:e2e` (Playwright)
- Before a PR: `pnpm lint && pnpm typecheck && pnpm format:check && pnpm test && pnpm build`

## Stack notes

- Next.js 16: `middleware.ts` is now `src/proxy.ts`; `LayoutProps`/`PageProps`
  are global generated types (`next typegen`). Read `node_modules/next/dist/docs/`
  when unsure about an API.
- Node 24 LTS, pnpm, Tailwind v4, shadcn/ui (`radix-nova`, add components with
  `pnpm dlx shadcn@latest add <name>`), Zod 4, Vitest 5, Playwright.
- Env vars: add to `src/env.ts` schemas and `.env.example`; import `env` from
  `@/env`, never read `process.env` directly.

## Non-negotiables

- **RLS is the authorization gate.** Every new table: `enable row level security`
  in the same migration + policies + RLS tests (cross-workspace denial, role checks).
- Schema changes only through `supabase/migrations` (Supabase CLI). Never edit the
  cloud DB by hand. Regenerate `src/lib/db/types.ts` after each migration.
- Security-definer functions: `set search_path = ''`, fully-qualified names,
  live in schema `private`.
- The service-role client is server-only and always scoped by `workspace_id`.
- Timestamps are `timestamptz` in UTC; tests run under `TZ=UTC`.
- Validate all input with Zod (forms, server actions, env, API).
- UI needs empty, loading, and error states, keyboard access, and dark mode.

## Definition of done

Unit tests for logic, RLS tests for new tables, e2e for new primary flows,
migration + types committed and `pnpm db:reset` works, docs/CHANGELOG updated,
CI green.
