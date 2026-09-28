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
- Authentication (F05): email magic link and GitHub OAuth through Supabase
  Auth; `/sign-in` page, `/auth/callback` route (PKCE code exchange or token
  hash verification), `/auth/error` page with plain-language copy for expired
  links, cancelled GitHub consent and email rate limits, and a sign-out Server
  Action; `src/proxy.ts` refreshes the session and redirects signed-out
  visitors of `/w/*`, `/u/*` and `/onboarding` to `/sign-in?next=<path>`, with
  `next` restricted to same-origin paths (open-redirect guard); placeholder
  `/w` page; Playwright auth e2e (users created through the Admin API, signed
  in with `auth.admin.generateLink`) and an `e2e` CI job.
- Onboarding & user profile (F06): `/onboarding` flow (display name → handle
  with live availability check → discipline → create a workspace or join one
  through a pending invite for the user's email); `src/proxy.ts` sends
  signed-in users who have not finished onboarding from every app route to
  `/onboarding?next=<path>`; profile page `/u/[handle]` (avatar, discipline,
  bio, skills, links, placeholders for owned assets and recent activity) with
  an owner-only editor at `/u/[handle]/edit`; private Storage bucket `avatars`
  (≤ 2 MB, raster images, owner writes `<user_id>/…`, workspace peers read).
  Migration `onboarding_profiles`: onboarding completion requires name,
  handle and discipline (DB check), `onboarded_at` stamped by the server and
  never cleared, column-level update grants on `profiles`, RPCs
  `is_handle_available`, `my_pending_invites` and `accept_pending_invite`.
  RLS tests for handles, onboarding, invites and avatars; e2e for onboarding
  and profile editing.
- Workspaces, membership & invites (F07): `/w` lists the user's workspaces
  (and pending invites) and redirects to the last used one (cookie written
  by the workspace layout on visits; `?all` shows the list); `/w/new` creates a workspace;
  `/w/[workspace]` home with a workspace switcher in the header; members page
  `/w/[workspace]/settings/members` to invite by email, change roles, remove
  members, leave, and revoke pending invites. Invites use a 32-byte random
  token whose sha256 hash is stored; the link `/invite/<token>` is emailed
  through a pluggable `Mailer` (`ConsoleMailer` for now) and shown once to the
  inviter. `/invite/[token]` accepts it (email must match, not expired, not
  used). Migration `workspaces_membership_invites`: last-owner guard
  (constraint trigger rejecting any update/delete that leaves a workspace
  without an owner), memberships can only change `role`, reserved slug `new`,
  RPCs `invite_preview(token)` and `accept_invite(token)`. RLS tests for
  roles (admin invites, member cannot, viewer read-only), the last-owner guard
  and token invites; e2e for inviting, accepting, managing members and
  switching workspaces.
- App shell & design system baseline (F08): every workspace page renders in
  a shell with a collapsible sidebar (icons only with Ctrl/Cmd+B, a drawer
  below 768px), a top bar with URL-derived breadcrumbs and a light/dark/system
  theme toggle, a skip link and the account menu. The sidebar is driven by the
  feature registry `src/features/registry.ts` (`{ id, label, icon, href(ws),
minRole? }`), so later milestones add entries by config. Routes
  `/w/[workspace]/{home,projects,catalog,docs,settings}` each render an empty
  state; `/w/[workspace]` redirects to `home`, and unknown paths inside a
  workspace get a 404 inside the shell. Shared components: `EmptyState`,
  `PageHeader`, `Page`, `DataTable` (TanStack Table v9, sortable, accessible
  headers), toasts (sonner; used for member and invite changes),
  `ConfirmDialog`, `PageSkeleton`, root `error.tsx`, `global-error.tsx` and
  `not-found.tsx`. Playwright + axe (`@axe-core/playwright`) checks every
  shell route in light and dark mode for serious or critical WCAG 2.1 AA
  violations, plus keyboard and tablet-width checks.

### Changed

- Sign-in uses email + password instead of email magic links (#17): the
  built-in Supabase mailer is rate limited to a couple of emails per hour, so
  links often never arrived. `/sign-in` has a password form with a "Create an
  account" mode (`signUp`; min 8, max 72 characters, Zod-validated) next to
  GitHub OAuth; the Server Action applies the onboarding guard itself because
  the proxy does not run for a Server Action's redirect target. New error copy
  for wrong credentials, unconfirmed email, existing account and weak password.
  The callback no longer accepts `type=magiclink`. e2e users get a random
  password and sign in through the form (`signIn` fixture replaces
  `magicLinkPath`).

### Fixed

- Shell tablet e2e waits for the page `<title>` before the axe check (it was
  flaky after client-side navigation).
- Entities select/update policies now check the row's own columns, so
  `insert … returning` (`.insert().select()`) works for the entity's owner
  (migration `entities_rls_row_checks`).
- Invite emails are matched case-insensitively (migration
  `invite_email_case_insensitive`): with `search_path = ''` the citext `=`
  operator was not resolved and comparisons fell back to case-sensitive text.
