---
title: "Tessera — Implementation Roadmap (MVP → v1.0)"
type: roadmap
status: active
created: 2026-09-26
updated: 2026-09-29
tags: [tessera, data-team, roadmap, planning, portfolio]
---

# 🗺️ Tessera — Implementation Roadmap

> **Tessera** is a working name. A tessera is one tile of a mosaic, and the app is
> a mosaic of features borrowed from several tools and joined by one graph.
> Rename it freely before the repo is created.

A collaborative workspace for data teams (analysts, data scientists, data
engineers) that joins the **people**, **knowledge**, and **data assets** of a
team in one graph: catalog, lineage, data-quality tests, pipelines, incidents,
data models, architecture decisions, and docs.

**Project goal:** a portfolio and learning project first. If the prototype turns
out well, it becomes open source (see [M5 — Open-source readiness](#m5--open-source-readiness)). That
drives three rules:

1. Every milestone ends in a **demoable, deployed increment**.
2. **Integrate, don't replace.** Tessera never runs pipelines or queries
   warehouses. It _registers_ them and _receives_ their results (webhooks, dbt
   artifacts). That keeps scope sane and makes the product credible.
3. **AI comes last** ([M6 — AI assist (last)](#m6--ai-assist-last)). The product must be valuable
   without it; AI then speeds up flows that already exist.

Every numbered story below (`F01`, `C03`, `Q02`…) is meant to become **one
GitHub issue**. See the [issue template](#appendix-a--github-issue-template)
and the [label scheme](#appendix-b--labels--milestones).

---

## 1. What makes it different (the product thesis)

Data teams already use a tool per slice: dbt for models, Airflow for pipelines,
Great Expectations or Monte Carlo for quality, Notion or Confluence for docs,
Jira for tasks, dbdiagram for modeling, Slack for "who owns this table?". None of
them knows about the others, so the **context** lives in people's heads.

Tessera's unique mix:

| Borrowed from                    | Idea                                | The Tessera twist                                                                                                 |
| -------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Notion / Obsidian                | Docs with `@mentions` and backlinks | Mentions point at **data assets**, so a table's page shows every doc, ADR, incident, and comment that mentions it |
| Atlan / DataHub                  | Catalog + lineage                   | Lightweight, dbt-import-first, with owners and people's expertise                                                 |
| Great Expectations / Monte Carlo | Test catalog + results              | Failing test → incident → postmortem → action items in **one flow**                                               |
| Airflow UI / PagerDuty           | Pipeline registry + on-call         | SLA per pipeline, with the on-call owner and runbook one click away                                               |
| dbdiagram / Miro                 | ERD canvas                          | Versioned **proposals with visual diff and review**, plus drift detection against the live catalog                |
| ADR repos / RFCs                 | Architecture decisions              | ADRs linked to the assets they affect, plus a future-projects roadmap                                             |
| Jira Service Desk                | Request intake                      | "I need data X" requests with SLA timers, delivered as a linked asset                                             |
| Linear "My issues"               | Personal home                       | Role-aware home: analyst, scientist, and engineer each see what matters to them                                   |
| — (unique)                       | **Impact analysis**                 | "If I change this column, what breaks _and who must I tell_?", answered from the graph                            |
| — (unique)                       | **Expertise directory**             | "Who knows about `fct_orders`?", computed from ownership, edits, and incidents                                    |

**Personal vs collaborative:** every user has a profile and a private space
(private notes, their own assets, inbox, tasks). Every **project** has shared
pages, assets, decisions, and a feed. The same page can move from private to
project to workspace visibility.

---

## 2. Stack & architecture decisions

| Concern                        | Choice                                                                                                                    | Why                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language                       | **TypeScript** (strict) end to end                                                                                        | One language for UI, API, and DB types; best hiring signal for full-stack                                                                                                               |
| Web framework                  | **Next.js 16** (App Router, React Server Components, Server Actions)                                                      | SSR + API routes in one deployable; mainstream                                                                                                                                          |
| DB / Auth / Realtime / Storage | **Supabase** (PostgreSQL 15+)                                                                                             | Postgres for the graph (recursive CTEs), Auth, Realtime for presence/notifications, `pg_cron` for SLA checks, `pgvector` later for AI. Fully OSS, so it self-hosts                      |
| Authorization                  | **Postgres RLS** as the primary gate                                                                                      | Unlike the table-tennis app (functions are the gate), here the browser talks to Supabase with the user's JWT and RLS enforces tenancy. This is a different pattern to learn and to show |
| Migrations                     | Supabase CLI (`supabase/migrations`), applied to the Supabase Cloud project (no local stack, no Docker)                   | Versioned and replayable, unlike hand-run SQL                                                                                                                                           |
| DB types                       | `supabase gen types` → `src/lib/db/types.ts`                                                                              | Compile-time safety on queries                                                                                                                                                          |
| Validation                     | **Zod**                                                                                                                   | Shared schemas for forms, server actions, and the public API                                                                                                                            |
| UI                             | **Tailwind CSS v4 + shadcn/ui** (Radix) + lucide icons                                                                    | Accessible primitives you own the code for                                                                                                                                              |
| Graph & canvases               | **React Flow** (`@xyflow/react`) + **elkjs** auto-layout                                                                  | Lineage, ERD, and architecture diagrams all use one library                                                                                                                             |
| Rich text                      | **Tiptap** (ProseMirror)                                                                                                  | Mentions, slash commands, code blocks; Yjs collaboration later                                                                                                                          |
| Data fetching (client)         | TanStack Query (only where client state is needed)                                                                        | Server Components cover most reads                                                                                                                                                      |
| Charts                         | Recharts (following the `dataviz` skill palette)                                                                          | Quality and pipeline health dashboards                                                                                                                                                  |
| Tests                          | **Vitest** (unit), **Vitest + Supabase Cloud project** (RLS/DB tests), **Playwright** (e2e + axe a11y)                    | RLS needs real Postgres tests, not mocks                                                                                                                                                |
| CI                             | **GitHub Actions**                                                                                                        | lint → typecheck → unit → db tests → build → e2e                                                                                                                                        |
| Hosting                        | **Vercel** (app) + **Supabase Cloud** free tier; `docker compose` for self-host (M5)                                      | Free for a portfolio; self-host for OSS                                                                                                                                                 |
| Email                          | Resend (M2)                                                                                                               | Invites and digests                                                                                                                                                                     |
| AI (M6)                        | **Claude API** (`claude-sonnet-5` default, `claude-haiku-4-5` for cheap classification) + Voyage embeddings in `pgvector` | Bring-your-own key for OSS                                                                                                                                                              |
| Package manager                | pnpm                                                                                                                      | Fast, strict                                                                                                                                                                            |
| License                        | **Apache-2.0** (decide in F01)                                                                                            | Permissive, with a patent grant; common for dev tools                                                                                                                                   |

**Code location:** a new repo, e.g. `C:\Users\franc\Desktop\DEV\Tessera`
(GitHub `FranciscoJavierCotos/tessera`). Single Next.js app, not a monorepo,
until a real second package exists (the SDK in O04).

### 2.1 Core data model — "everything is an entity"

The central design decision. Every addressable thing (project, asset, page,
test, incident, ADR, task…) has a row in **`entities`**. Cross-cutting features
(comments, mentions/backlinks, activity, notifications, search, and later
embeddings) reference `entities.id` with a **real foreign key** instead of
polymorphic `(type, id)` pairs. RLS is written once, against the entity's
workspace and visibility.

```
workspaces ─┬─ workspace_members (user_id, role: owner|admin|member|viewer)
            ├─ invites
            └─ entities (id, workspace_id, type, title, visibility, project_id?, owner_id, search tsv)
                  │  1:1 extension tables share the entity's id as PK:
                  ├─ projects        (slug, status, description)
                  ├─ assets          (kind: dataset|pipeline|dashboard|ml_model|metric|source_system,
                  │                   qualified_name, properties jsonb, tags[])
                  │     └─ dataset_columns (name, data_type, description, is_pii, position)
                  ├─ pages           (kind: doc|adr|runbook|postmortem|note, content jsonb, content_text, version)
                  ├─ quality_tests   (M2)   ├─ incidents (M2)   ├─ data_models (M3) ...
                  │
                  ├─ asset_edges        (from_entity, to_entity, relation, source: manual|dbt|api)
                  ├─ entity_references  (from_entity, to_entity)          ← mentions / backlinks
                  ├─ comments           (entity_id, parent_id, anchor jsonb, body, resolved_at)
                  ├─ activity_events    (entity_id, actor_id, verb, payload)
                  └─ notifications      (user_id, activity_event_id, read_at)

profiles (id = auth.users.id, handle, display_name, discipline, bio, skills[])
project_members (project_id, user_id, role: lead|contributor|viewer)
```

**Visibility rules** (enforced by RLS via `security definer` helpers
`is_workspace_member(ws)`, `workspace_role(ws)`, `can_read_entity(id)`):

- `private`: owner only (personal notes, drafts)
- `project`: members of `project_id`
- `workspace`: every member of the workspace
- `viewer` role: read-only everywhere. `member` and above can write what they
  can read.

### 2.2 Architecture overview

```
Browser ──(user JWT)──► Supabase (RLS)          ◄── reads/writes of app data
   │                                                                  ▲
   └──► Next.js (Vercel)                                               │
         ├─ Server Components / Server Actions ── user-scoped client ──┤
         ├─ /api/v1/*  (public ingestion API, API-key auth) ─ service client scoped to key's workspace
         └─ /api/ai/*  (M6, Claude API)

External tools ──webhooks / dbt artifacts──► /api/v1/*   (Airflow, dbt, GitHub Actions, Python SDK)
pg_cron (in Postgres) ──► SLA / staleness checks ──► activity_events → notifications
```

---

## 3. Dependency graph (milestone level)

```
M0 Foundations ─► M1 Collaboration MVP (v0.1) ─┬─► M2 Integrations & reliability (v0.2) ─┐
                                               ├─► M3 Design & architecture (v0.3) ──────┼─► M5 OSS readiness (v0.9) ─► M6 AI assist (v1.0)
                                               └─► M4 Team workflow & knowledge (v0.4) ──┘
```

M2, M3, and M4 depend only on M1, so their order is a **value** decision, not a
technical one. The order chosen:

1. **M2 first**: reliability (quality, pipelines, incidents, impact) is the
   daily pain of a data team and the part no single tool covers. dbt import also
   fills the catalog with realistic data, which makes every later demo better.
2. **M3 second**: modeling and architecture are the "future projects" half of
   the request, and the ERD proposal diff is the most visual portfolio piece.
3. **M4 third**: workflow (tasks, requests, glossary, expertise) is valuable but
   more familiar territory.

---

## 4. Milestones & stories

Conventions per story: **Goal**, **Tasks** (checklist; becomes the issue body),
**Acceptance** (the issue's definition of done), and **Depends on**. Every
story also implicitly includes the
[global definition of done](#appendix-c--definition-of-done-every-issue).

---

### 🏗️ M0 — Foundations (walking skeleton)

_End state: a deployed app where you can sign in, create a workspace, invite a
teammate, and see an empty but navigable shell. CI green; RLS tested._

> ✅ **Done — 2026-09-29.** All eight stories merged (PRs #9–#16, plus #18
> replacing magic links with passwords), deployed at
> <https://tessera-data.vercel.app>, sign-in verified by hand. What was actually
> built, and the known gaps carried into M1, are in the
> [M0 spec](specs/m0-foundations.md#m0-delivered).

#### F01 — Repository scaffold & tooling

**Depends on:** — · **Delivered:** #9
**Goal:** a clean, strict, reproducible Next.js + TypeScript project.

- [x] `pnpm create next-app` (App Router, TS strict, `src/`, ESLint), Node 24 LTS pinned in `.nvmrc` + `engines`.
- [x] Tailwind v4 + shadcn/ui init; base theme tokens (light/dark).
- [x] Prettier + `eslint-config-prettier`; `.editorconfig`.
- [x] Vitest configured (`pnpm test`); Playwright installed (`pnpm test:e2e`) with one smoke test.
- [x] `src/env.ts`: Zod-validated env vars (the app fails fast on missing config); `.env.example`.
- [x] `README.md` skeleton (pitch, stack, local setup), `LICENSE` (Apache-2.0), `CLAUDE.md` with conventions.
      **Acceptance:** `pnpm dev` renders a landing page; `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass locally.

#### F02 — CI pipeline

**Depends on:** F01 · **Delivered:** #10
**Goal:** nothing merges to `main` without passing checks.

- [x] `.github/workflows/ci.yml`: pnpm cache → lint → typecheck → unit tests → build.
- [x] Branch protection on `main` (required checks, PR-only, squash merge).
- [x] Conventional Commits documented in `CONTRIBUTING.md` (lightweight version).
      **Acceptance:** a PR with a failing test is blocked; a green PR can merge.

#### F03 — Supabase project, migrations & core schema

**Depends on:** F01 · **Delivered:** #11
**Goal:** a versioned database with the entity core and default-deny RLS.

- [x] `supabase init` + link to the cloud project; `pnpm db:push|db:types|db:lint|db:seed` scripts. **No local stack and no Docker:** every environment (dev, tests, CI) uses the Supabase Cloud project.
- [x] Migration `0001_core`: `profiles`, `workspaces`, `workspace_members`, `invites`, `entities` (+ enums for roles, discipline, entity type, visibility).
- [x] Trigger: create a `profiles` row on `auth.users` insert.
- [x] `security definer` helpers: `is_workspace_member`, `workspace_role`, `can_read_entity`, `can_write_entity` (with `search_path` pinned).
- [x] RLS **enabled on every table**; policies for the tables above.
- [x] Generated types committed to `src/lib/db/types.ts`; typed server and browser Supabase clients (`@supabase/ssr`).
- [x] `supabase/seed.sql` (idempotent) with the dev users and workspaces, loaded into the cloud project on demand.
      **Acceptance:** the migration applies cleanly to the cloud project and its version matches the file in `supabase/migrations`; types generated from the cloud project compile; `get_advisors` security lint is clean.

#### F04 — RLS test harness + DB job in CI

**Depends on:** F02, F03 · **Delivered:** #12
**Goal:** authorization is tested against real Postgres, not assumed.

- [x] `tests/db/` Vitest suite against the Supabase Cloud project. Fixtures (users A in workspace 1, B in workspace 2, viewer V) are created per run through the Admin API with unique emails and deleted afterwards.
- [x] Helpers: `asUser(user)` returns an authenticated client; `expectDenied(query)`.
- [x] Cases: cross-workspace read denied; viewer cannot write; private entity hidden from other members.
- [x] CI job: runs the db tests against the cloud project (URL and keys from GitHub secrets; no Docker), plus the security advisor / `supabase db lint --linked`.
      **Acceptance:** removing any policy makes at least one test fail (spot-check two policies).

#### F05 — Authentication

**Depends on:** F03 · **Delivered:** #13, #18
**Goal:** users can sign up, sign in, and sign out securely.

- [x] Email + password + GitHub OAuth (Supabase Auth). _(Magic links replaced by passwords in #17.)_
- [x] `proxy.ts` (Next.js 16 `middleware.ts`) refreshes the session and protects `/w/*` routes.
- [x] Sign-in page, auth callback route, sign-out action.
- [x] Error states (expired link, OAuth denied) in plain language.
      **Acceptance:** Playwright e2e signs in with a test user (Supabase Admin API creates the user) and reaches `/w`; signed-out access to `/w/*` redirects to sign-in.

#### F06 — Onboarding & user profile

**Depends on:** F05 · **Delivered:** #14
**Goal:** every user has an individual identity with a discipline.

- [x] First-login flow: display name, unique `handle`, **discipline** (data analyst / data scientist / data engineer / analytics engineer / lead), then create or join a workspace.
- [x] Profile page `/u/[handle]`: avatar (Supabase Storage), bio, skills (tags), links; editable by the owner only.
- [x] Profile shows placeholders for owned assets and recent activity (filled by C02 and C07).
      **Acceptance:** a new user cannot reach the app without finishing onboarding; handle uniqueness is enforced in the DB, not just the UI.

#### F07 — Workspaces, membership & invites

**Depends on:** F06, F04 · **Delivered:** #15
**Goal:** multi-tenant teams with roles.

- [x] Create workspace (name, slug); creator becomes `owner`.
- [x] Invite by email: `invites` row with hashed token and 7-day expiry, accept page, email through a pluggable mailer (console in dev, Resend later).
- [x] Members settings page: change role, remove member; **guard: the last owner cannot leave or be demoted** (DB constraint or trigger, not just UI).
- [x] Workspace switcher.
- [x] RLS tests for roles (admin can invite; member cannot; viewer is read-only).
      **Acceptance:** two users in the same workspace see each other in the members list; a user in another workspace sees nothing.

#### F08 — App shell & design system baseline

**Depends on:** F07 · **Delivered:** #16
**Goal:** a consistent, navigable frame every feature plugs into.

- [x] Route structure `/w/[workspace]/{home,projects,catalog,docs,settings}`.
- [x] Sidebar with feature registry (later milestones add entries by config), top bar, breadcrumbs.
- [x] Shared components: empty state, page header, data table (TanStack Table), toasts, confirm dialog, loading skeletons, error boundary, 404.
- [x] Dark mode, keyboard focus states, responsive down to tablet.
      **Acceptance:** every route renders an empty state; Playwright + axe reports no serious a11y violations on the shell.

---

### 🧩 M1 — Collaboration MVP → **v0.1.0 (minimum working app)**

_End state: a team can create projects, catalog datasets with lineage, write
linked docs, discuss anything, get notified, and find anything with ⌘K. Deployed
with a demo workspace._

#### C01 — Projects

**Depends on:** F08 · **Delivered:** #22
**Goal:** the collaborative unit of work.

- [x] Migration: `projects` (extends `entities`), `project_members`.
- [x] Create/edit/archive a project: name, slug, description, status (`planning|active|paused|done`), visibility (`workspace|private`).
- [x] Project members with roles (`lead|contributor|viewer`).
- [x] Project home: overview, members, and slots for linked assets, pages, and feed (filled by later stories).
- [x] Projects list with status filter.
- [x] RLS tests: a private project is invisible to non-members.
      **Acceptance:** a contributor can edit; a project viewer cannot; a workspace member outside a private project gets a 404.

#### C02 — Asset catalog core

**Depends on:** C01
**Goal:** a shared inventory of the team's data assets with owners.

- [ ] Migration: `assets` (kind, `qualified_name` unique per workspace, `properties jsonb`, tags), `dataset_columns`, `project_assets`.
- [ ] Create/edit a **dataset** manually: name, qualified name (`db.schema.table`), description (markdown), owner, tags, columns (name, type, description, PII flag).
- [ ] Other kinds with generic forms: `dashboard` (URL, tool), `source_system`, `ml_model`.
- [ ] Catalog list: filter by kind, owner, tag, project; sort; paginate.
- [ ] Asset page with tabs: Overview · Columns · Lineage (C03) · Docs & mentions (C05) · Discussion (C06).
- [ ] Link and unlink assets to projects.
      **Acceptance:** CRUD works under RLS; `qualified_name` duplicates are rejected with a clear message; PII columns show a badge.

#### C03 — Asset graph & lineage view

**Depends on:** C02
**Goal:** see how data flows between assets.

- [ ] Migration: `asset_edges` (from, to, relation `feeds|reads|writes|derived_from`, source `manual|dbt|api`), unique `(from, to, relation)`, check `from <> to`.
- [ ] SQL function `asset_lineage(root, direction, max_depth)`: recursive CTE with cycle protection; returns nodes and edges.
- [ ] UI: "Add upstream / downstream" picker on the asset page.
- [ ] Lineage tab: React Flow + elkjs left-to-right layout, depth selector (1–5), click a node to navigate, highlight the root.
- [ ] Performance check: a seeded graph of 1,000 nodes returns in < 300 ms locally (index on edges).
      **Acceptance:** upstream and downstream render correctly on a graph containing a cycle (no infinite loop); unit tests for the SQL function.

#### C04 — Docs & wiki editor

**Depends on:** C01
**Goal:** knowledge pages, personal and shared.

- [ ] Migration: `pages` (kind, `content jsonb`, `content_text` for search, `parent_id` for trees, `version`).
- [ ] Tiptap editor: headings, lists, checklists, tables, callouts, code blocks with SQL/Python highlighting, links, images (Storage), slash-command menu.
- [ ] Page tree per project + workspace docs + **"My notes"** (private).
- [ ] Autosave with **optimistic concurrency** (`version` check). On conflict, show "someone else edited this, reload or copy your changes" rather than silently overwriting.
- [ ] Templates: blank, meeting notes, runbook, onboarding guide.
- [ ] Move a page between private, project, and workspace visibility.
      **Acceptance:** two tabs editing the same page produce a conflict notice, never lost data; private notes invisible to others (RLS test).

#### C05 — Mentions & backlinks (the glue)

**Depends on:** C02, C04
**Goal:** connect knowledge to data and people.

- [ ] Tiptap mention extensions: `@` for people, `#` for assets, pages, and projects (search-as-you-type, permission-aware).
- [ ] On save, extract mentions server-side and reconcile `entity_references` (insert new, delete removed) in one transaction.
- [ ] "Referenced in" panel on asset, page, project, and profile pages.
- [ ] Mention chips render live titles (a rename propagates) and show a "no access" state for entities the reader cannot see.
      **Acceptance:** mentioning `#fct_orders` in a doc makes that doc appear on the `fct_orders` page; removing the mention removes it; a private page never leaks through backlinks (RLS test).

#### C06 — Comments & discussions

**Depends on:** C02, C04
**Goal:** discuss any entity in context.

- [ ] Migration: `comments` (entity_id FK, `parent_id` for threads, `anchor jsonb` for column-level or text-range comments, `resolved_at`).
- [ ] Threaded comments on assets, pages, and projects; comment on a specific **column** from the Columns tab.
- [ ] Markdown body with `@mentions` (reuses C05 extraction); edit/delete own comment; resolve/reopen thread.
      **Acceptance:** comments inherit entity visibility; a viewer can read but not post.

#### C07 — Activity feed & in-app notifications

**Depends on:** C05, C06
**Goal:** know what changed and what needs you.

- [ ] Migration: `activity_events`, `notifications`.
- [ ] Record events through **DB triggers** on key tables (actor = `auth.uid()`), so no code path can forget to log.
- [ ] Fan-out rules: mentioned → notify; comment on something you own → notify; ownership assigned → notify; reply in your thread → notify.
- [ ] Feeds: project feed, workspace feed, entity history tab, profile "recent activity".
- [ ] Inbox page + unread badge updated through **Supabase Realtime**; mark read / all read.
      **Acceptance:** a mention in another user's session shows an unread badge within seconds without a reload; events respect visibility.

#### C08 — Personal home ("My Home")

**Depends on:** C07
**Goal:** each person's day starts in one place.

- [ ] Widget registry (`id`, `title`, `disciplines[]`, `component`) so M2–M4 add widgets by config.
- [ ] Initial widgets: my projects, assets I own, inbox preview, my recent pages, quick private note, recently viewed.
- [ ] Default layout per **discipline** (analyst: dashboards and metrics first; scientist: ML models; engineer: datasets and pipelines); the user can reorder and hide widgets (persisted in `profiles.home_layout`).
      **Acceptance:** two users with different disciplines see different default homes; layout changes persist.

#### C09 — Search & command palette

**Depends on:** C02, C04
**Goal:** find anything in two keystrokes.

- [ ] Generated `tsvector` columns (with `unaccent`) on titles, descriptions, `content_text`, and column names; GIN indexes.
- [ ] RPC `search_workspace(q, types[], limit)` ranked by `ts_rank` plus a recency boost, executed under RLS.
- [ ] ⌘K palette (`cmdk`): search results grouped by type, navigation shortcuts, quick actions (new page, new dataset, new project).
- [ ] Full search page with type filters.
      **Acceptance:** searching a column name finds its dataset; results never include inaccessible entities (RLS test).

#### C10 — Demo data, deploy & v0.1.0 release

**Depends on:** C01–C09
**Goal:** a public, impressive, working MVP.

- [ ] Seed script `pnpm seed:demo`: an "Acme Commerce" workspace with ~40 datasets (raw → staging → marts), lineage, 3 projects, docs with mentions, comments, and 3 users of different disciplines.
- [ ] Supabase Cloud project + Vercel deploy; preview deploys per PR; production env vars documented.
- [ ] Read-only **demo login** (a viewer-role demo user) linked from the landing page.
- [ ] README: screenshots/GIF, architecture diagram, the "everything is an entity" explanation, local setup in ≤ 5 commands.
- [ ] `CHANGELOG.md`; tag `v0.1.0`; GitHub release.
      **Acceptance:** a stranger can open the URL, log in as demo, and explore lineage, docs, and backlinks without an account.

---

### 🛡️ M2 — Integrations & data reliability → **v0.2.0**

_End state: dbt projects populate the catalog automatically; quality tests and
pipeline runs stream in over the API; failures become incidents with blast
radius, owners, and postmortems._

#### I01 — API keys & public ingestion API

**Depends on:** C10
**Goal:** a secure door for external tools.

- [ ] Migration: `api_keys` (workspace, name, **hashed** secret, prefix for display, scopes[], last_used_at, revoked_at).
- [ ] Settings UI: create key (secret shown **once**), revoke, see last use.
- [ ] `/api/v1/*` route handlers: key auth → service client **always scoped by the key's workspace_id** (helper that makes it impossible to query without it).
- [ ] Zod-validated payloads, `Idempotency-Key` header support, per-key rate limit (Postgres counter table, not in-memory).
- [ ] OpenAPI spec generated from the Zod schemas (`zod-openapi`), served at `/api/v1/openapi.json` plus a docs page.
      **Acceptance:** a revoked key gets `401`; a key from workspace A can never write to workspace B (tested); replaying the same idempotency key does not duplicate data.

#### I02 — dbt artifacts import

**Depends on:** I01, C03
**Goal:** go from zero to a real catalog + lineage in one upload.

- [ ] Parse `manifest.json` (models, sources, seeds, snapshots, exposures) and optional `catalog.json` (column types).
- [ ] Map to assets (`qualified_name` = `database.schema.alias`), columns, descriptions, tags, owners (from `meta.owner` when it matches a member email), and edges from `depends_on` (`source = dbt`); exposures → dashboards.
- [ ] **Idempotent upsert**: re-import updates dbt-sourced fields but never overwrites human-edited descriptions (field-level `description_source` flag); assets removed from dbt are marked `deprecated`, not deleted.
- [ ] Import through the UI (upload) and the API (`POST /api/v1/dbt/artifacts`); a GitHub Actions snippet in the docs for "upload after `dbt build`".
- [ ] Import history with a diff summary (added / changed / deprecated).
- [ ] Fixture: jaffle_shop manifest committed for tests.
      **Acceptance:** importing jaffle_shop twice produces the same graph (idempotent); a human-edited description survives a re-import.

#### Q01 — Data-quality test catalog

**Depends on:** C02
**Goal:** know what is tested, why, and what isn't.

- [ ] Migration: `quality_tests` (entity): target dataset + optional column, type (`not_null|unique|accepted_values|relationships|freshness|row_count|custom_sql|other`), config jsonb, severity (`warn|error`), owner, **rationale** ("why this test exists"), source (`manual|dbt|api`).
- [ ] Create and edit tests manually; dbt tests mapped automatically (extend I02).
- [ ] Dataset "Quality" tab: tests per column.
- [ ] **Coverage**: % of columns with ≥ 1 test, critical untested columns (PII, primary keys, columns with incident history later), per dataset and per project.
      **Acceptance:** coverage numbers match a hand-computed fixture; dbt tests appear after import.

#### Q02 — Test results ingestion & quality health dashboard

**Depends on:** Q01, I01
**Goal:** see quality over time, not just today's status.

- [ ] Migration: `test_runs` (test, status `pass|warn|fail|error`, failures_count, observed_at, run_url).
- [ ] API `POST /api/v1/test-runs` (batch) + dbt `run_results.json` import.
- [ ] Per-test status history (sparkline); dataset health badge (`healthy|warning|failing|stale` when there is no run within the expected window).
- [ ] Workspace quality dashboard: failing now, **flaky tests** (status flip rate over 30 runs), coverage by project, trend of failures per week.
- [ ] Charts built following the `dataviz` skill (palette validated, accessible).
- [ ] Failing `error`-severity test → activity event → notifies the dataset owner.
      **Acceptance:** pushing a failing run turns the dataset badge red and notifies the owner; the flakiness metric is unit-tested.

#### P01 — Pipeline registry

**Depends on:** C03
**Goal:** every pipeline has an owner, a runbook, and known inputs/outputs.

- [ ] `pipeline` asset kind with properties: orchestrator (`airflow|dagster|dbt_cloud|github_actions|cron|other`), external id, schedule (cron, rendered in plain words), repo URL, **runbook page** link, owner, **on-call** member, expected duration, SLA ("done by 07:00 Europe/Madrid").
- [ ] Reads/writes edges to datasets (so lineage shows pipelines between datasets).
- [ ] Pipelines list: owner, schedule, last status, SLA.
      **Acceptance:** a pipeline appears as a node between its input and output datasets in the lineage view.

#### P02 — Pipeline runs & SLA monitoring

**Depends on:** P01, I01
**Goal:** know when data is late before the business does.

- [ ] Migration: `pipeline_runs` (pipeline, external_run_id unique, status `running|success|failed|skipped`, started_at, finished_at, logs_url).
- [ ] API: start/finish/upsert run; docs with ready-made snippets for an Airflow callback, GitHub Actions, and a plain `curl`.
- [ ] Run history table + duration trend chart; outputs' freshness derived from the last successful run.
- [ ] **SLA checks with `pg_cron`** every 5 min: a late or failed run creates an activity event → notifies owner and on-call. Explicit timezone handling (store UTC, SLA defined in the workspace timezone).
      **Acceptance:** a simulated run missing its SLA produces exactly one notification (no duplicates on the next cron tick); timezone tests run under `TZ=UTC`.

#### R01 — Incidents

**Depends on:** Q02, P02, C07
**Goal:** a shared place to handle data breakages.

- [ ] Migration: `incidents` (entity): severity `SEV1–SEV3`, status `investigating|identified|monitoring|resolved`, commander, started_at, resolved_at; `incident_updates` (timeline); `incident_assets`.
- [ ] Open an incident from a failing test or run (prefilled) or manually.
- [ ] **Affected assets auto-suggested from downstream lineage** of the failing asset.
- [ ] Incident page: status banner, timeline of updates, affected assets, participants; live via Realtime.
- [ ] Asset pages show "3 incidents in the last 90 days".
      **Acceptance:** opening an incident from a failing test suggests its downstream dashboards; status changes appear live in a second browser.

#### R02 — Postmortems & action items

**Depends on:** R01, C04
**Goal:** learn from incidents instead of repeating them.

- [ ] "Write postmortem" creates a `postmortem` page from a template prefilled with the timeline, affected assets, and duration.
- [ ] Action items as lightweight checklist entities with owner and due date (upgraded to full tasks in W01).
- [ ] Postmortem index; an incident cannot be closed as `resolved + reviewed` until the postmortem exists (for SEV1/SEV2).
      **Acceptance:** the prefilled postmortem contains the incident timeline; open action items appear on the owner's home.

#### A01 — Impact analysis

**Depends on:** C03, P01, Q01
**Goal:** "if I change this, what breaks and who must I tell?"

- [ ] From an asset (or a column, using asset-level lineage plus the column name matched against downstream columns as a heuristic, clearly labeled), traverse downstream up to N levels.
- [ ] Report: affected assets grouped by kind (datasets, pipelines, dashboards, ML models), their **owners**, tests that will run, linked projects, and open incidents.
- [ ] "Announce change": creates a change-announcement page (mentions all affected assets), notifies every affected owner, with an optional planned date.
- [ ] Shareable URL of the impact report.
      **Acceptance:** on the demo graph, a change to a staging table lists the downstream dashboards and their owners; announcing notifies each owner once.

#### N01 — Outbound notifications (email + Slack)

**Depends on:** C07, R01
**Goal:** reach people where they already are.

- [ ] Per-user notification preferences (in-app / email / off per event type).
- [ ] Email through Resend (invites switch to it too); a daily digest option.
- [ ] Slack incoming webhook per workspace or project: incidents, SLA breaches, SEV changes.
- [ ] Delivery log with retries (outbox table processed by `pg_cron` + a route handler).
      **Acceptance:** a SEV1 incident posts to the configured Slack channel; opt-out preferences are respected.

---

### 📐 M3 — Design & architecture → **v0.3.0**

_End state: the team designs data models visually, reviews them like pull
requests, records architecture decisions, and plans future projects._

#### D01 — Data-modeling canvas (ERD)

**Depends on:** C10
**Goal:** design models where the team already documents data.

- [ ] Migration: `data_models` (entity): level `conceptual|logical|physical`, `document jsonb` (tables, columns, keys, relationships, layout), version.
- [ ] React Flow editor: table nodes with editable columns (name, type, PK/FK, nullable, description), relationship edges with cardinality (1:1, 1:N, N:M) in crow's-foot notation.
- [ ] Dimensional helpers: mark tables as **fact / dimension / bridge**, state the **grain**, SCD type on dimensions.
- [ ] Auto-layout, minimap, zoom, snap; keyboard shortcuts; undo/redo.
      **Acceptance:** a star schema of one fact table and four dimensions can be built and saved and reloads identically.

#### D02 — Model versions, proposals & review

**Depends on:** D01, C06
**Goal:** review data model changes the way code changes are reviewed.

- [ ] Immutable version snapshots; "Propose change" creates a proposal branch from a version.
- [ ] **Visual diff**: added (green), removed (red), and changed (amber) tables, columns, and relationships, on the canvas and as a list.
- [ ] Review flow: reviewers, comments anchored to a table or column (C06 `anchor`), approve / request changes, merge into the main version.
- [ ] **Drift detection**: link model tables to catalog datasets and flag differences (column missing in the warehouse, type mismatch).
      **Acceptance:** the diff algorithm is unit-tested on fixtures (rename vs drop+add is handled explicitly); merging creates a new version.

#### D03 — Model import & export

**Depends on:** D01
**Goal:** don't retype what already exists.

- [ ] Import from catalog datasets (select → tables), from **DDL** (`node-sql-parser`: Postgres, Snowflake, BigQuery), and from **DBML**.
- [ ] Export to DDL (per dialect), DBML, dbt `schema.yml` (models + columns + tests generated from keys: `unique`/`not_null` on PKs, `relationships` on FKs), and PNG/SVG.
      **Acceptance:** DDL → model → DDL round-trips on fixtures; the exported dbt YAML validates against dbt's JSON schema.

#### D04 — Architecture Decision Records

**Depends on:** C05
**Goal:** remember _why_ the platform looks the way it does.

- [ ] ADR page kind with structured fields: status (`proposed|accepted|superseded|deprecated`), context, **options considered** (each with pros/cons), decision, consequences, deciders, date.
- [ ] `supersedes` chain (the ADR page shows "superseded by ADR-0012").
- [ ] Linked assets, models, and pipelines ("this decision affects…"); shown on those entities' pages.
- [ ] ADR log per project and workspace, filterable by status; auto-numbering per workspace.
      **Acceptance:** superseding an ADR updates both pages; the ADR appears on every linked asset's page.

#### D05 — Architecture diagrams

**Depends on:** D01
**Goal:** draw the current and target platform and link it to reality.

- [ ] Freeform diagram canvas (React Flow) with a node palette: sources, ingestion, storage/warehouse, transformation, orchestration, BI, ML, with generic icons.
- [ ] Nodes can **link to catalog assets, pipelines, or ADRs** (click-through, and a badge when a linked asset is failing).
- [ ] Current vs target states (two layers); embed a diagram inside docs (Tiptap node).
      **Acceptance:** a diagram embedded in a doc stays in sync with the canvas; failing health shows on linked nodes.

#### D06 — Future projects roadmap & RFC flow

**Depends on:** C01, D04
**Goal:** plan what the team builds next, together.

- [ ] Project lifecycle extended: `idea → proposed (RFC) → approved → active → done`.
- [ ] RFC template: problem, proposal, alternatives, data needed, affected assets, effort by discipline.
- [ ] Voting and comments on RFCs; the approval decision is recorded as an ADR (link).
- [ ] Roadmap view: projects on a quarter timeline, dependencies between projects, capacity by discipline (sum of estimated effort vs team size).
      **Acceptance:** approving an RFC moves the project to `approved` and creates a linked ADR draft.

---

### 🤝 M4 — Team workflow & knowledge → **v0.4.0**

_End state: day-to-day coordination, stakeholder requests, shared metric
definitions, and "who knows what" live in the same graph._

#### W01 — Project tasks board

**Depends on:** C07
**Goal:** lightweight coordination without leaving the context.

- [ ] Migration: `tasks` (entity): status (configurable columns), assignee, due date, priority, labels, estimate.
- [ ] Kanban + list views per project; drag to reorder (fractional indexing).
- [ ] Link tasks to assets, incidents, ADRs, and RFCs; postmortem action items (R02) become tasks.
- [ ] "My tasks" widget on the home page.
      **Acceptance:** moving a card persists order across reloads; a task linked to an asset shows on the asset page.

#### W02 — Data request intake

**Depends on:** W01, N01
**Goal:** stop losing stakeholder requests in Slack DMs.

- [ ] Request form (available to viewers too): question, business context, decision it informs, deadline, requester.
- [ ] Triage queue: assign, estimate, accept/decline with a reason, convert to a task.
- [ ] SLA timers (time to first response, time to delivery); the requester is notified at each status change.
- [ ] Delivery links the resulting asset (dashboard/dataset) to the request, so the answer is reusable.
- [ ] Request analytics: volume by team, median time to delivery, top requested topics.
      **Acceptance:** a viewer can submit and track a request but not triage it.

#### K01 — Metrics glossary (semantic definitions)

**Depends on:** C05
**Goal:** one definition of "active user".

- [ ] `metric` asset kind: business definition, formula/SQL, grain, dimensions, filters, owner, **certified** flag.
- [ ] Links to source datasets and to dashboards using it; appears in lineage.
- [ ] Change history with a text diff and a required "reason for change".
- [ ] **Conflict warning**: similar names across projects with different formulas ("revenue" vs "net_revenue").
      **Acceptance:** editing a certified metric requires the owner or an admin and records the reason.

#### K02 — Expertise directory ("who knows X")

**Depends on:** C07, R01
**Goal:** find the right person, not just the right doc.

- [ ] Nightly `pg_cron` job computes per-person expertise scores per asset and tag from ownership, edits, comments, incident resolution, and reviews, with time decay.
- [ ] "Ask an expert" box on asset pages (top 3 people besides the owner).
- [ ] Team skills matrix: disciplines × tags, from profile skills plus computed expertise.
      **Acceptance:** scoring is unit-tested on a fixture timeline; the explanation "why this person" is shown.

#### S01 — Experiment log (data science)

**Depends on:** C02, I01
**Goal:** give data scientists a first-class place in the graph.

- [ ] Migration: `experiments` (entity) + `experiment_runs` (params jsonb, metrics jsonb, dataset snapshot references, artifact URL, notes).
- [ ] Hypothesis → runs → conclusion page; compare runs (table + chart of a chosen metric).
- [ ] Link to `ml_model` assets and training datasets (lineage shows dataset → experiment → model).
- [ ] API ingestion + a tiny Python snippet (`requests.post`) in the docs.
      **Acceptance:** runs pushed through the API appear in the comparison view.

#### K03 — Realtime collaboration (presence & co-editing)

**Depends on:** C04, D01
**Goal:** Google-Docs-style collaboration on docs and canvases.

- [ ] **Spike first** (timeboxed, 1 day): Yjs over Supabase Realtime broadcast vs a small Hocuspocus server. Record the choice as an ADR in Tessera itself.
- [ ] Presence avatars on pages, canvases, and incidents.
- [ ] Co-editing for docs (Tiptap Collaboration + cursors); canvases get presence and edit locking per node (full CRDT canvas is out of scope).
- [ ] Persistence: Yjs updates snapshotted to `pages.content`.
      **Acceptance:** two browsers editing the same doc converge without conflicts; the C04 version check keeps working for non-collaborative clients.

#### K04 — Weekly team digest (non-AI)

**Depends on:** R01, D04, W02
**Goal:** a Monday summary that nobody has to write.

- [ ] `pg_cron` weekly job builds a digest per workspace and project: incidents, SLA breaches, failing tests, new/changed ADRs, delivered requests, new docs.
- [ ] Rendered as a page (archivable) + email.
      **Acceptance:** the digest for a fixture week matches expected counts.

---

### 🌍 M5 — Open-source readiness → **v0.9.0**

_End state: someone else can run, understand, and contribute to Tessera._

#### O01 — Self-hosting

**Depends on:** M2

- [ ] `docker compose up` brings up the app + Supabase (self-hosted stack) + seed demo.
- [ ] Production Dockerfile (Next.js standalone output), env reference, backup notes.
      **Acceptance:** a fresh machine goes from clone to a running demo with one command.

#### O02 — Contributor experience & docs

**Depends on:** O01

- [ ] `CONTRIBUTING.md` (full), `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue/PR templates, `good first issue` labels.
- [ ] Docs site (Starlight or Nextra) with user guide, API reference (from OpenAPI), architecture, and the project's own ADRs.
      **Acceptance:** a newcomer can follow the docs to their first PR (dry-run with a friend or a fresh VM).

#### O03 — Hardening

**Depends on:** M2–M4 as built

- [ ] RLS audit: a generated test that asserts **every table** has RLS enabled plus at least one cross-workspace denial test.
- [ ] Security review (API scopes, SSRF on user URLs, XSS in rendered markdown, file upload types), then fixes.
- [ ] Performance: indexes review, lineage at 10k nodes, pagination everywhere, bundle size budget.
- [ ] Accessibility pass (axe in e2e on all main routes); admin audit log.
      **Acceptance:** CI includes the RLS completeness test; no serious axe violations.

#### O04 — Python SDK, CLI & GitHub Action

**Depends on:** I01, I02, Q02, P02

- [ ] `tessera-sdk` (Python, PyPI): push test runs, pipeline runs, and experiment runs; upload dbt artifacts.
- [ ] CLI `tessera dbt upload --target-dir target/`.
- [ ] GitHub Action `tessera/dbt-upload` for "after `dbt build`".
      **Acceptance:** the jaffle_shop example repo pushes artifacts and test results through the Action.

---

### 🤖 M6 — AI assist (last) → **v1.0.0**

_End state: AI speeds up flows that already work without it. Every AI output is
a draft a human accepts, and every answer cites the entities it used._

#### AI01 — AI foundation

**Depends on:** M5

- [ ] Server-only Claude client; per-workspace **enable toggle** and **bring-your-own API key** (encrypted at rest). Required for OSS.
- [ ] Usage logging (tokens, cost, feature) and per-workspace monthly caps.
- [ ] Versioned prompt templates in code; an **eval harness** with fixtures run in CI on prompt changes (reuse the ChordCoach eval experience).
- [ ] Privacy guard: PII-flagged columns are never sent with sample values; only metadata leaves the DB.
      **Acceptance:** AI features are fully hidden when disabled; evals gate prompt changes.

#### AI02 — Semantic search & "Ask the workspace"

**Depends on:** AI01, C09

- [ ] `pgvector` embeddings (Voyage) for pages, asset descriptions, ADRs, postmortems; incremental re-embedding on change.
- [ ] Hybrid search (FTS + vector) in ⌘K.
- [ ] "Ask the workspace" chat: RAG **retrieved under the user's RLS**, answers cite entities as links, and it says "I don't know" when retrieval is empty.
      **Acceptance:** eval set of ≥ 20 Q&A pairs on the demo workspace with a groundedness threshold; a user never gets content from entities they cannot read (test).

#### AI03 — Documentation drafting

**Depends on:** AI01

- [ ] Draft dataset and column descriptions from schema, lineage, and dbt SQL; the user reviews and edits in a diff view before saving.
- [ ] Summarize a long comment thread; turn a discussion into an ADR draft (D04 fields prefilled).
      **Acceptance:** nothing AI-generated is saved without an explicit accept; accepted text is marked `description_source = ai_accepted`.

#### AI04 — Quality test suggestions

**Depends on:** AI01, Q01

- [ ] Suggest tests from column names and types, keys, profile statistics (no raw values), and incident history, each with a rationale.
- [ ] One-click accept creates `quality_tests` (and exports to dbt YAML through D03).
      **Acceptance:** suggestions for the jaffle_shop fixture include `unique`/`not_null` on primary keys (eval).

#### AI05 — Incident copilot

**Depends on:** AI01, R02

- [ ] Summarize the incident timeline for stakeholders.
- [ ] Suggest probable causes from upstream lineage, recent failed runs and tests, and recent model or metric changes, ranked, with evidence links.
- [ ] Draft the postmortem from the timeline.
      **Acceptance:** on seeded incident scenarios the true cause appears in the top 3 suggestions (eval).

#### AI06 — Data-model assistant

**Depends on:** AI01, D02

- [ ] From a requirements text ("we need to analyze subscription churn by plan and region") propose a star schema **as a D02 proposal**, reviewed like any human proposal.
- [ ] Explain the grain and the fact/dimension choices in the proposal description.
      **Acceptance:** the output always validates against the model document schema; it is never merged automatically.

---

## 5. Parking lot (deliberately out of scope)

Ideas that are good but would sink a portfolio project. Revisit after v1.0:

- Direct warehouse connectors (querying `information_schema` of Snowflake/BigQuery/Postgres) and automatic profiling.
- True column-level lineage (SQL parsing of every model).
- Hosted SQL notebooks or a query editor.
- Billing, plans, SSO/SAML, SCIM, audit exports: commercial SaaS concerns.
- Mobile apps; offline mode.
- Full CRDT collaboration on canvases.

## 6. Risks & how the plan handles them

| Risk                                    | Mitigation                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Scope explosion (50 stories)            | v0.1 is complete and valuable on its own; each later milestone ships independently; the parking lot says no explicitly |
| RLS bugs leaking data across workspaces | F04 harness from day one; O03 completeness test; entity-based RLS written once                                         |
| Polymorphic sprawl                      | "everything is an entity" with real FKs (§2.1)                                                                         |
| Empty-app demos                         | C10 demo seed + I02 dbt import make the app look real early                                                            |
| Timezone bugs in SLAs and digests       | Store UTC, workspace timezone explicit, CI tests under `TZ=UTC` (lesson from the table-tennis app)                     |
| AI dominating the project               | AI is last, behind a toggle, and every feature is draft-and-accept with evals                                          |

---

## Appendix A — GitHub issue template

```markdown
## Goal

<one sentence from the story>

## Context

Milestone: <M?> · Depends on: #<issue>, #<issue>
Roadmap: docs/roadmap.md (<story id>)

## Tasks

- [ ] ...

## Acceptance criteria

- [ ] ...
- [ ] Global definition of done (tests, RLS tests for new tables, docs, CI green)

## Out of scope

- ...
```

Title format: `<ID> — <title>`, e.g. `C05 — Mentions & backlinks`.

## Appendix B — Labels & milestones

- **Milestones:** `M0 Foundations`, `M1 v0.1 Collaboration MVP`, `M2 v0.2 Reliability`, `M3 v0.3 Design & architecture`, `M4 v0.4 Workflow & knowledge`, `M5 v0.9 OSS readiness`, `M6 v1.0 AI assist`.
- **Type:** `type:feature`, `type:infra`, `type:chore`, `type:bug`, `type:spike`, `type:docs`.
- **Area:** `area:auth`, `area:workspace`, `area:catalog`, `area:lineage`, `area:docs`, `area:collab`, `area:search`, `area:api`, `area:quality`, `area:pipelines`, `area:incidents`, `area:modeling`, `area:architecture`, `area:workflow`, `area:ai`.
- **Priority:** `P0` (blocks the milestone), `P1`, `P2` (nice to have inside the milestone).
- `good first issue` once the repo is public (M5).

## Appendix C — Definition of done (every issue)

- Unit tests for logic; **RLS tests for every new table** (cross-workspace denial + role checks).
- An e2e test for any new primary user flow.
- Migration committed and applied to the Supabase Cloud project (versions match); DB types regenerated from it.
- UI: empty, loading, and error states; keyboard accessible; dark mode.
- Docs updated (README / CLAUDE.md / API docs as relevant); CHANGELOG entry.
- CI green; PR linked to the issue with `Closes #<n>`.

## Appendix D — Story count per milestone

| Milestone                     | Stories                                           | Release    |
| ----------------------------- | ------------------------------------------------- | ---------- |
| M0 Foundations                | 8 (F01–F08)                                       | — ✅ done  |
| M1 Collaboration MVP          | 10 (C01–C10)                                      | **v0.1.0** |
| M2 Integrations & reliability | 10 (I01–I02, Q01–Q02, P01–P02, R01–R02, A01, N01) | v0.2.0     |
| M3 Design & architecture      | 6 (D01–D06)                                       | v0.3.0     |
| M4 Team workflow & knowledge  | 7 (W01–W02, K01–K04, S01)                         | v0.4.0     |
| M5 OSS readiness              | 4 (O01–O04)                                       | v0.9.0     |
| M6 AI assist                  | 6 (AI01–AI06)                                     | v1.0.0     |
