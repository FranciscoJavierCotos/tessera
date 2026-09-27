# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Repository scaffold (F01): Next.js 16 App Router, strict TypeScript, Node 24
  LTS, Tailwind v4 + shadcn/ui with light/dark themes, ESLint + Prettier,
  Vitest unit tests, Playwright smoke test, Zod-validated env (`src/env.ts`),
  and a landing page.
- CI pipeline (F02): GitHub Actions workflow (`ci` check) running lint,
  typecheck, format check, unit tests, and build on every PR and push to
  `main`; branch protection on `main`; `CONTRIBUTING.md` with the branch,
  commit, and PR conventions.
- Supabase core schema (F03), cloud-only (no local stack, no Docker): Supabase
  CLI as a dev dependency with `db:link|push|types|lint|seed` scripts targeting
  the `tessera` cloud project; migration `core` with enums,
  `profiles`, `workspaces`, `workspace_members`, `invites` and `entities`;
  default-deny RLS on every table with policies backed by `security definer`
  helpers in schema `private`; `auth.users` → `profiles` trigger; workspace
  creator becomes owner (trigger + `create_workspace` RPC); idempotent dev seed
  with three users and two workspaces; generated DB types and typed server/browser
  Supabase clients (`@supabase/ssr`).
- RLS test harness (F04): Vitest `db` project (`pnpm test:db`) running
  `tests/db/**` against the Supabase Cloud project with per-run fixtures (users
  A, B, V and their workspaces/entities created through the Admin API and
  deleted afterwards), helpers `asUser`, `asAnon`, `expectDenied`, and cases
  for cross-workspace isolation, viewer read-only, private entities, anonymous
  access and permitted writes; CI job `db` (serialized) runs the suite and
  `supabase db lint --linked` (now failing on warnings).

### Fixed

- Entities select/update policies now check the row's own columns, so
  `insert … returning` (`.insert().select()`) works for the entity's owner
  (migration `entities_rls_row_checks`).
