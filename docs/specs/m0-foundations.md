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

- `pnpm create next-app@16` with App Router, TypeScript, `src/`, ESLint, Tailwind v4, import alias `@/*`.
- `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`.
- `.nvmrc` = `24` (Node 24 LTS); `package.json` `"engines": { "node": ">=24" }`, `"packageManager": "pnpm@<version>"`.
- Scripts (the contract every later story relies on):

| Script                                         | Command                                              |
| ---------------------------------------------- | ---------------------------------------------------- |
| `dev`                                          | `next dev`                                           |
| `build`                                        | `next build`                                         |
| `lint`                                         | `eslint .`                                           |
| `typecheck`                                    | `SKIP_ENV_VALIDATION=1 next typegen && tsc --noEmit` |
| `format` / `format:check`                      | `prettier --write .` / `prettier --check .`          |
| `test`                                         | `vitest run --project unit` (`tests/db` excluded)    |
| `test:db`                                      | `vitest run --project db` (added in F04)             |
| `test:e2e`                                     | `playwright test`                                    |
| `db:push` / `db:types` / `db:lint` / `db:seed` | added in F03 (cloud project; no Docker)              |

- `src/env.ts`: Zod schemas split into `server` and `client` (`NEXT_PUBLIC_*`);
  throws a readable error listing missing variables. Initial variables:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (server), `NEXT_PUBLIC_SITE_URL`.
- Landing page at `/`: product pitch + "Sign in" link (placeholder until F05).
- Playwright smoke test: `/` returns 200 and shows the product name.
- Notes: `next typegen` generates the global `LayoutProps`/`PageProps` types, so
  it runs before `tsc`. `src/env.ts` is imported by `next.config.ts`, so
  `dev`/`build`/`start` fail fast on bad config; `SKIP_ENV_VALIDATION=1` bypasses
  it (typegen, CI jobs without secrets). pnpm `shellEmulator` keeps `VAR=1 cmd`
  scripts working on Windows.

## F02 — CI pipeline

- `.github/workflows/ci.yml` on `pull_request` and `push` to `main`:
  `pnpm install --frozen-lockfile` (pnpm store cache) → `lint` → `typecheck` →
  `format:check` → `test` → `build`. `concurrency` cancels superseded runs.
- Job name `ci` is the required status check.
- Branch protection on `main`: PR required, required check `ci`, linear history,
  squash merge only, delete branch on merge.
- `CONTRIBUTING.md`: branch naming `<type>/<issue>-<slug>`, Conventional
  Commits, PR must `Closes #n`.

## F03 — Supabase project, migrations & core schema

Tooling: Supabase CLI as a dev dependency (`supabase` npm package, run through
`pnpm supabase`). **No local stack and no Docker**: the CLI is only used to
create migration files, push them to the cloud project, generate types and
lint. One-time setup: `pnpm supabase login` and `pnpm db:link` (asks for the
database password).

| Script     | Command                                                                   |
| ---------- | ------------------------------------------------------------------------- |
| `db:link`  | `supabase link --project-ref ijhtgvmcyrzmkmfiavnu`                        |
| `db:push`  | `supabase db push` (applies pending migrations to the cloud project)      |
| `db:types` | `supabase gen types typescript --project-id … > src/lib/db/types.ts`      |
| `db:lint`  | `supabase db lint --linked --level warning`                               |
| `db:seed`  | `supabase db push --include-seed` (loads `supabase/seed.sql`; idempotent) |

The Supabase MCP (`apply_migration`, `get_advisors`,
`generate_typescript_types`) is an equivalent path for migrations, lints and
types.

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

Workspace creation goes through RPC `create_workspace(name, slug)`, which
inserts the workspace and returns it; the `on_workspace_created` trigger
(security definer, in `private`) adds the creator as `owner` in the same
transaction. The RPC itself is `security invoker`, so the insert is checked by
RLS as the caller and no `security definer` function is exposed through the API.

Admins manage non-owner memberships and invites only: granting, changing or
removing the `owner` role requires an owner. `anon` has no privileges on any
table; `profiles` rows are only inserted by the `auth.users` trigger.

### Seed (`supabase/seed.sql`)

| User      | Email                | Workspace | Role   |
| --------- | -------------------- | --------- | ------ |
| Alice (A) | `alice@tessera.test` | `acme`    | owner  |
| Val (V)   | `val@tessera.test`   | `acme`    | viewer |
| Bob (B)   | `bob@tessera.test`   | `globex`  | owner  |

Plus: one `workspace` entity and one `private` entity (owner Alice) in `acme`.
Password for all seed users: `password123`. The seed is idempotent and loaded
into the cloud project only on demand (`pnpm db:seed`); it is for manual
testing of the dev project and must never be loaded into a production project.
Automated tests do not depend on it.

## F04 — RLS test harness + DB job in CI

- Vitest project `db` runs `tests/db/**` against the Supabase Cloud project
  (URL and keys from `.env.local` locally, GitHub secrets in CI). No Docker.
- Fixtures: a `beforeAll` creates users A, B, V with unique emails
  (`<role>+<runId>@tessera.test`) and random passwords through the Admin API
  (service role), plus their workspaces and entities; an `afterAll` deletes
  them (deleting the users cascades to profiles and memberships). Tests never
  rely on the seed.
- `tests/db/helpers.ts`: `asUser(user)` signs in and returns a typed client;
  `asAnon()`; `expectDenied(promise)` asserts either an RLS error or zero rows
  affected/returned.
- Minimum cases: B cannot read `acme` entities/members; V cannot insert/update
  entities; V cannot read Alice's private entity; A can read both.
- CI job `db` (separate from `ci`, also required): `pnpm test:db` against the
  cloud project, then `supabase db lint --linked` (needs
  `SUPABASE_ACCESS_TOKEN` and the DB password as secrets). Runs with
  `concurrency` so two runs never share fixtures. A PR that adds a migration
  applies it to the cloud project before its `db` job can pass.

## F05 — Authentication

- Providers: email magic link (OTP) and GitHub OAuth (Supabase Auth). The GitHub
  OAuth app callback is `https://ijhtgvmcyrzmkmfiavnu.supabase.co/auth/v1/callback`.
- Routes: `/sign-in`, `/auth/callback` (PKCE code exchange), `/auth/error`, sign-out Server Action.
- `src/proxy.ts` (Next.js 16 rename of `middleware.ts`): refresh session via `@supabase/ssr`; unauthenticated
  `/w/*`, `/u/*`, `/onboarding` → `/sign-in?next=<path>`. `next` must be a
  same-origin relative path (open-redirect guard).
- Error copy for: expired/used link, OAuth denied, email rate limited.
- e2e: create user through the Admin API, sign in with a generated magic link
  (`auth.admin.generateLink`), land on `/w`.

## F06 — Onboarding & user profile

- `/onboarding` steps: display name → handle (live availability check,
  DB-enforced uniqueness) → discipline → create or join a workspace (join via
  pending invite for the user's email). Steps 1–3 save the profile; step 4
  creates a workspace (`create_workspace`), accepts an invite, or continues
  with an existing membership, then stamps `onboarded_at` and goes to `next`.
- Guard: signed-in users with `profiles.onboarded_at is null` are redirected
  from every app route (`/w/*`, `/u/*`) to `/onboarding?next=<path>` by
  `src/proxy.ts` (one `profiles` lookup per app request; a failed lookup
  counts as not onboarded). Onboarded users skip `/onboarding`.
- `/u/[handle]`: avatar (Storage bucket `avatars`, path `<user_id>/…`, owner-write
  policy, ≤ 2 MB, image types only), bio, skills tags, links; edit only for owner
  at `/u/[handle]/edit`. Profiles of users who share no workspace with the
  viewer are hidden (404) by RLS.
- Placeholders: "Owned assets" (C02) and "Recent activity" (C07).

### Database (migrations `onboarding_profiles`, `invite_email_case_insensitive`)

| Object                                 | Rule                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `profiles` checks                      | `onboarded_at` requires `handle`, non-blank `display_name`, `discipline`; `avatar_path` starts with `<id>/`; ≤ 20 skills; ≤ 10 links |
| `profiles_stamp_onboarded_at` trigger  | `onboarded_at` is set to `now()` once and can never be cleared                                                                       |
| `profiles` grants                      | `authenticated` may update only `handle, display_name, discipline, bio, skills, avatar_path, links, onboarded_at`                    |
| `is_handle_available(handle)`          | true when well-formed and not taken by another user (works without read access to other profiles)                                    |
| `my_pending_invites()`                 | unexpired, unaccepted invites for the caller's email (case-insensitive) to workspaces they are not in                                |
| `accept_pending_invite(invite_id)`     | verifies email, expiry and not-accepted; adds the membership with the invite's role; marks the invite accepted                       |
| bucket `avatars`                       | private; 2 MB; `image/png`, `image/jpeg`, `image/webp`, `image/gif` (no SVG)                                                         |
| `storage.objects` policies (`avatars`) | insert/update/delete: first folder = `auth.uid()`; select: owner or a user sharing a workspace (`private.can_read_avatar`)           |

The public RPCs are `security invoker` wrappers over `security definer`
functions in `private` (`private.accept_invite_row` is reused by F07's
token-based `accept_invite`). Avatars are served through short-lived signed
URLs. Saving the profile removes the user's other avatar objects (replaced or
abandoned uploads).

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

### Routes

| Route                             | Purpose                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/w`                              | Workspaces list + pending invites; redirects to the last used workspace (cookie `tessera-last-workspace`, set by `src/proxy.ts` on `/w/<slug>/…` visits, prefetches ignored) unless `?all` |
| `/w/new`                          | Create a workspace (`create_workspace`), then open it                                                                                                                                      |
| `/w/[workspace]`                  | Workspace home (placeholder until F08); the layout 404s for non-members and renders the switcher                                                                                           |
| `/w/[workspace]/settings/members` | Everyone sees the list; owners/admins invite, change roles, remove, revoke invites; anyone can leave                                                                                       |
| `/invite/[token]`                 | Preview and accept an invite (protected route; onboarding runs first for new users)                                                                                                        |

The invite link is shown once to the inviter after creation (only the hash is
stored), so invites work while the mailer only logs to the console.

### Database (migration `workspaces_membership_invites`)

| Object                             | Rule                                                                                                                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaces_slug_not_reserved`     | slug `new` is reserved (static route `/w/new`)                                                                                                                                                                 |
| `workspace_members` grants         | `authenticated` may update only `role` (a membership never moves between users or workspaces)                                                                                                                  |
| `workspace_members_keep_an_owner`  | constraint trigger: rejects (`23514`) an update/delete that leaves the workspace without an owner; locks the workspace row to serialize concurrent changes; skipped when the workspace itself is being deleted |
| `private.hash_invite_token(token)` | hex `sha256` of the UTF-8 token (same as `hashInviteToken` in `src/lib/workspace/invite-token.ts`)                                                                                                             |
| `invite_preview(token)`            | workspace, role, inviter, expiry, `status` (`pending`/`expired`/`accepted`), `email_matches`, `is_member`                                                                                                      |
| `accept_invite(token)`             | finds the invite by hash and runs `private.accept_invite_row` (email, expiry, not accepted); returns the workspace id                                                                                          |

A new invite to the same email replaces the pending one. Errors map to plain
copy in the UI (last owner → "make someone else an owner first").

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
