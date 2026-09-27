# CLAUDE.md — Tessera

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
