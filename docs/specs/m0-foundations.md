# M0 — Foundations (walking skeleton) · Spec

Status: ready · Milestone: `M0 Foundations` · Stories: F01–F08
Source: [roadmap §4 M0](../roadmap.md) ·
Architecture: [architecture.md](architecture.md)

**End state:** a deployed app where you can sign in, create a workspace, invite a
teammate, and see an empty but navigable shell. CI green; RLS tested.

## Build order

```
F01 ─┬─► F02 ─────────┐
     └─► F03 ─┬───────┴─► F04 ─┐
              └─► F05 ─► F06 ──┴─► F07 ─► F08
```

F02 and F03 can run in parallel after F01.

---

## F01 — Repository scaffold & tooling

- `pnpm create next-app@15` with App Router, TypeScript, `src/`, ESLint, import alias `@/*`.
- `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`.
- `.nvmrc` = `22`; `package.json` `"engines": { "node": ">=22 <23" }`, `"packageManager": "pnpm@<version>"`.
- Scripts (the contract every later story relies on):

| Script                                           | Command                                       |
| ------------------------------------------------ | --------------------------------------------- |
| `dev`                                            | `next dev`                                    |
| `build`                                          | `next build`                                  |
| `lint`                                           | `eslint .`                                    |
| `typecheck`                                      | `tsc --noEmit`                                |
| `format` / `format:check`                        | `prettier --write .` / `prettier --check .`   |
| `test`                                           | `vitest run` (unit only; `tests/db` excluded) |
| `test:db`                                        | `vitest run --project db` (added in F04)      |
| `test:e2e`                                       | `playwright test`                             |
| `db:start` / `db:stop` / `db:reset` / `db:types` | added in F03                                  |

- `src/env.ts`: Zod schemas split into `server` and `client` (`NEXT_PUBLIC_*`);
  throws a readable error listing missing variables. Initial variables:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (server), `NEXT_PUBLIC_SITE_URL`.
- Landing page at `/`: product pitch + "Sign in" link (placeholder until F05).
- Playwright smoke test: `/` returns 200 and shows the product name.

## F02 — CI pipeline

- `.github/workflows/ci.yml` on `pull_request` and `push` to `main`:
  `pnpm install --frozen-lockfile` (pnpm store cache) → `lint` → `typecheck` →
  `format:check` → `test` → `build`. `concurrency` cancels superseded runs.
- Job name `ci` is the required status check.
- Branch protection on `main`: PR required, required check `ci`, linear history,
  squash merge only, delete branch on merge.
- `CONTRIBUTING.md`: branch naming `<type>/<issue>-<slug>`, Conventional
  Commits, PR must `Closes #n`.

## F03 — Supabase local stack, migrations & core schema

Tooling: Supabase CLI as a dev dependency (`supabase` npm package, run through
`pnpm supabase`); Docker Desktop is a documented prerequisite.

### Enums (`public`)

```sql
create type workspace_role as enum ('owner','admin','member','viewer');
create type discipline     as enum ('data_analyst','data_scientist','data_engineer','analytics_engineer','lead');
create type entity_type    as enum ('project','asset','page');   -- extended by later migrations
create type visibility     as enum ('private','project','workspace');
```

### Tables

| Table               | Key columns                                                                                                                                                                         | Notes                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `profiles`          | `id uuid pk → auth.users on delete cascade`, `handle citext unique`, `display_name`, `discipline`, `bio`, `skills text[]`, `avatar_path`, `links jsonb`, `onboarded_at timestamptz` | `handle` check `^[a-z0-9_]{3,30}$`; row created by trigger on `auth.users` insert with `handle = null` until onboarding |
| `workspaces`        | `id`, `slug citext unique`, `name`, `created_by`, `created_at`                                                                                                                      | slug check `^[a-z0-9-]{3,40}$`                                                                                          |
| `workspace_members` | pk `(workspace_id, user_id)`, `role workspace_role`, `joined_at`                                                                                                                    | index on `user_id`                                                                                                      |
| `invites`           | `id`, `workspace_id`, `email citext`, `role`, `token_hash text unique`, `invited_by`, `expires_at`, `accepted_at`                                                                   | raw token never stored; default expiry `now() + 7 days`                                                                 |
| `entities`          | `id`, `workspace_id`, `type`, `title`, `visibility`, `project_id uuid null → entities`, `owner_id → profiles`, `created_at`, `updated_at`                                           | check: `visibility = 'project'` ⇒ `project_id is not null`; index `(workspace_id, type)`                                |

`search tsv` on `entities` is deferred to C09.

### Helpers (schema `private`)

`is_workspace_member`, `workspace_role`, `can_read_entity`, `can_write_entity`:
see [architecture §4](architecture.md#rls-helper-functions). Until C01 adds
`project_members`, `can_read_entity` treats `project` visibility as
"owner or workspace admin/owner"; C01 extends it.

### Policies (default-deny: RLS on every table)

| Table               | select                        | insert                                                         | update                 | delete                       |
| ------------------- | ----------------------------- | -------------------------------------------------------------- | ---------------------- | ---------------------------- |
| `profiles`          | self, or shares ≥ 1 workspace | trigger only                                                   | self                   | —                            |
| `workspaces`        | members                       | any authenticated user (creator becomes owner via trigger/RPC) | owner/admin            | owner                        |
| `workspace_members` | members of the same workspace | owner/admin (or invite acceptance RPC)                         | owner/admin            | owner/admin, or self (leave) |
| `invites`           | owner/admin of the workspace  | owner/admin                                                    | owner/admin (revoke)   | owner/admin                  |
| `entities`          | `can_read_entity(id)`         | role ≥ member in `workspace_id`, `owner_id = auth.uid()`       | `can_write_entity(id)` | owner or admin               |

Workspace creation goes through RPC `create_workspace(name, slug)` (security
definer) that inserts the workspace and the owner membership atomically.

### Seed (`supabase/seed.sql`)

| User      | Email                | Workspace | Role   |
| --------- | -------------------- | --------- | ------ |
| Alice (A) | `alice@tessera.test` | `acme`    | owner  |
| Val (V)   | `val@tessera.test`   | `acme`    | viewer |
| Bob (B)   | `bob@tessera.test`   | `globex`  | owner  |

Plus: one `workspace` entity and one `private` entity (owner Alice) in `acme`.
Password for all seed users: `password123` (local only).

## F04 — RLS test harness + DB job in CI

- `vitest.workspace.ts` with projects `unit` and `db`; `db` runs `tests/db/**`
  against the local stack (`SUPABASE_URL` from `supabase status -o env`).
- `tests/db/helpers.ts`: `asUser(email)` signs in with the seed password and
  returns a typed client; `asAnon()`; `expectDenied(promise)` asserts either an
  RLS error or zero rows affected/returned.
- Minimum cases: B cannot read `acme` entities/members; V cannot insert/update
  entities; V cannot read Alice's private entity; A can read both.
- CI job `db` (separate from `ci`, also required): setup Supabase CLI →
  `supabase start` → `supabase db reset` → `pnpm test:db`; also `supabase db lint`.

## F05 — Authentication

- Providers: email magic link (OTP) and GitHub OAuth (Supabase Auth). The GitHub
  OAuth app callback is `https://ijhtgvmcyrzmkmfiavnu.supabase.co/auth/v1/callback`.
- Routes: `/sign-in`, `/auth/callback` (PKCE code exchange), `/auth/error`, sign-out Server Action.
- `middleware.ts`: refresh session via `@supabase/ssr`; unauthenticated
  `/w/*`, `/u/*`, `/onboarding` → `/sign-in?next=<path>`. `next` must be a
  same-origin relative path (open-redirect guard).
- Error copy for: expired/used link, OAuth denied, email rate limited.
- e2e: create user through the Admin API, sign in with a generated magic link
  (`auth.admin.generateLink`), land on `/w`.

## F06 — Onboarding & user profile

- `/onboarding` steps: display name → handle (live availability check,
  DB-enforced uniqueness) → discipline → create or join a workspace (join via
  pending invite for the user's email).
- Guard: signed-in users with `profiles.onboarded_at is null` are redirected
  to `/onboarding` from every app route (middleware or layout).
- `/u/[handle]`: avatar (Storage bucket `avatars`, path `<user_id>/…`, owner-write
  policy, ≤ 2 MB, image types only), bio, skills tags, links; edit only for owner.
- Placeholders: "Owned assets" (C02) and "Recent activity" (C07).

## F07 — Workspaces, membership & invites

- Create workspace via `create_workspace` RPC; `/w` lists the user's workspaces
  and redirects to the last used one.
- Invites: owner/admin creates → server generates 32-byte random token, stores
  `sha256` hash, sends link `/invite/<token>` through the `Mailer` interface
  (`ConsoleMailer` in dev; `ResendMailer` in M2). Accept RPC
  `accept_invite(token)` verifies hash, expiry, not accepted, email matches the
  signed-in user.
- `/w/[workspace]/settings/members`: list, change role, remove, revoke invite.
- **Last-owner guard**: constraint trigger on `workspace_members` rejects any
  update/delete that leaves a workspace with zero owners.
- Workspace switcher in the shell.
- RLS tests: admin can invite; member cannot; viewer read-only; last-owner guard.

## F08 — App shell & design system baseline

- Routes: `/w/[workspace]/{home,projects,catalog,docs,settings}` each render an
  empty state.
- `src/features/registry.ts`: `{ id, label, icon, href(ws), minRole? }[]` drives
  the sidebar; later milestones add entries.
- Components: `EmptyState`, `PageHeader`, `DataTable` (TanStack Table),
  toasts (sonner), `ConfirmDialog`, skeletons, `error.tsx`, `not-found.tsx`.
- Theme: light/dark via `next-themes`, visible focus rings, responsive ≥ 768px.
- e2e: visit every shell route; `@axe-core/playwright` reports no `serious` or
  `critical` violations.

---

## M0 exit checklist

- [ ] All F01–F08 issues closed via PRs; `ci` and `db` checks required on `main`.
- [ ] Production deploy on Vercel wired to Supabase Cloud project `tessera`.
- [ ] Migrations applied to the cloud project through the CLI (`supabase db push`), not by hand.
- [ ] `get_advisors` (security) clean on the cloud project.
