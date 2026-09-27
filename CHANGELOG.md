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
- Supabase core schema (F03), cloud-only (no local stack, no Docker): Supabase
  CLI as a dev dependency with `db:link|push|types|lint|seed` scripts targeting
  the `tessera` cloud project; migration `core` with enums,
  `profiles`, `workspaces`, `workspace_members`, `invites` and `entities`;
  default-deny RLS on every table with policies backed by `security definer`
  helpers in schema `private`; `auth.users` → `profiles` trigger; workspace
  creator becomes owner (trigger + `create_workspace` RPC); idempotent dev seed
  with three users and two workspaces; generated DB types and typed server/browser
  Supabase clients (`@supabase/ssr`).
