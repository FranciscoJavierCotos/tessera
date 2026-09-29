# Tessera — Architecture Spec

Status: accepted; implemented through M0 (done 2026-09-29) · Source: [roadmap §2](../roadmap.md#2-stack--architecture-decisions)

## 1. Principles

1. **Integrate, don't replace.** Tessera never runs pipelines or queries
   warehouses. It registers them and receives their results (webhooks, dbt
   artifacts) through `/api/v1/*`.
2. **Everything is an entity.** Every addressable thing has a row in `entities`;
   cross-cutting features reference `entities.id` with a real foreign key.
3. **Postgres RLS is the authorization gate.** The browser and Server Components
   talk to Supabase with the user's JWT. Application code never re-implements
   tenancy checks as the only line of defence.
4. **Every milestone ships a deployed, demoable increment.**
5. **AI comes last** and is always optional (M6).

## 2. Stack

| Concern                          | Choice                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Language                         | TypeScript, `strict: true`, end to end                                                                   |
| Web                              | Next.js 16 (App Router, RSC, Server Actions)                                                             |
| Data / Auth / Realtime / Storage | Supabase (Postgres 15+), `@supabase/ssr`                                                                 |
| Sign-in                          | Supabase Auth: email + password, GitHub OAuth (magic links removed in #18)                               |
| Migrations                       | Supabase CLI, `supabase/migrations/*.sql`, applied to the cloud project (no Docker)                      |
| DB types                         | `supabase gen types typescript` → `src/lib/db/types.ts` (committed)                                      |
| Validation                       | Zod (forms, server actions, env, public API)                                                             |
| UI                               | Tailwind CSS v4, shadcn/ui (Radix), lucide-react                                                         |
| Graphs & canvases                | React Flow (`@xyflow/react`) + elkjs                                                                     |
| Rich text                        | Tiptap                                                                                                   |
| Tests                            | Vitest (unit), Vitest + Supabase Cloud (DB/RLS), Playwright + axe (e2e/a11y)                             |
| CI                               | GitHub Actions                                                                                           |
| Hosting                          | Vercel (`tessera-data.vercel.app`) + Supabase Cloud (`tessera`, ref `ijhtgvmcyrzmkmfiavnu`, `eu-west-3`) |
| Package manager                  | pnpm; Node 24 LTS (`.nvmrc`)                                                                             |
| License                          | Apache-2.0                                                                                               |

Single Next.js app (not a monorepo) until a second package exists (SDK, O04).

## 3. Runtime topology

```
Browser ──(user JWT)──► Supabase (RLS)            reads/writes of app data
   │                                                           ▲
   └──► Next.js (Vercel)                                        │
         ├─ Server Components / Server Actions ─ user-scoped client
         ├─ /api/v1/*  public ingestion API (API-key auth, M2) ─ service client scoped to the key's workspace
         └─ /api/ai/*  (M6)

External tools ─ webhooks / dbt artifacts ─► /api/v1/*
pg_cron ─► SLA / staleness checks ─► activity_events → notifications
```

### Supabase clients (`src/lib/supabase/`)

| Client                | Where                               | Key                        | Purpose                                                                                                                                                                   |
| --------------------- | ----------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createBrowserClient` | Client Components                   | publishable (anon)         | Realtime, client-side reads                                                                                                                                               |
| `createServerClient`  | RSC, Server Actions, route handlers | publishable + user cookies | All normal app reads/writes, under RLS                                                                                                                                    |
| `createServiceClient` | `/api/v1/*`, admin scripts, tests   | service role               | **Server-only.** Must always be wrapped by a helper that injects `workspace_id`; never imported from client code (enforced by `server-only`). Unused by app code as of M0 |

## 4. Core data model

```
workspaces ─┬─ workspace_members (workspace_id, user_id, role)
            ├─ invites
            └─ entities (id, workspace_id, type, title, visibility, project_id?, owner_id, search tsv)
                  │  1:1 extension tables share the entity's id as PK:
                  ├─ projects (M1) ├─ assets (M1) ├─ pages (M1) ├─ quality_tests (M2) …
                  ├─ asset_edges        (from_entity, to_entity, relation, source)
                  ├─ entity_references  (from_entity, to_entity)          mentions / backlinks
                  ├─ comments           (entity_id, parent_id, anchor, body, resolved_at)
                  ├─ activity_events    (entity_id, actor_id, verb, payload)
                  └─ notifications      (user_id, activity_event_id, read_at)

profiles (id = auth.users.id, handle, display_name, discipline, bio, skills[])
project_members (project_id, user_id, role: lead|contributor|viewer)
assets (id = entity, kind, qualified_name citext unique per workspace, description, properties jsonb, tags[])
dataset_columns (asset_id → dataset, name citext unique per asset, data_type, description, is_pii, ordinal)
project_assets (project_id, asset_id, added_by)             same-workspace links
catalog_assets (view, security invoker)                     asset + entity + owner + counts
asset_edges (from_asset → to_asset, relation, source)       lineage, same workspace, from = upstream
```

Extension-table rule: `<ext>.id uuid primary key references entities(id) on delete cascade`,
and the entity row's `type` must match the table (check via trigger or a
`type` column with a check constraint + composite FK).

### Visibility & roles

| Visibility  | Who can read                                           |
| ----------- | ------------------------------------------------------ |
| `private`   | `owner_id` only                                        |
| `project`   | members of `project_id` (plus workspace owners/admins) |
| `workspace` | every member of the workspace                          |

A **private project** (C01) is a `project` entity with visibility `project`
scoped to itself (`project_id = id`); a workspace-visible project has
visibility `workspace` and no `project_id` (check `entities_project_scope`).

| Workspace role | Can                                               |
| -------------- | ------------------------------------------------- |
| `owner`        | everything, incl. delete workspace, manage owners |
| `admin`        | manage members & invites, everything a member can |
| `member`       | create entities; write what they can read         |
| `viewer`       | read-only everywhere                              |

Invariant: a workspace always has ≥ 1 owner (DB-enforced, F07).

| Project role  | Can (with workspace role ≥ `member`)                     |
| ------------- | -------------------------------------------------------- |
| `lead`        | edit, archive, change visibility, manage project members |
| `contributor` | edit name, slug, description, status                     |
| `viewer`      | read-only                                                |

Workspace owners/admins act as leads on every project. A workspace `viewer`
is read-only whatever their project role. Project members must be members of
the workspace (composite FK; leaving the workspace removes them).

### Assets (C02)

An **asset** is an entity of type `asset` with a row in `assets` holding its
`kind` (`dataset | dashboard | source_system | ml_model`, immutable), its
`qualified_name` (`db.schema.table` for datasets; unique per workspace,
case-insensitive, without whitespace or `/ ? # % \`; it is the URL segment
`/catalog/<qualified name>`), a markdown description, kind-specific
`properties` (dashboard `url` + `tool`, source system `system`, model
`framework`, optional `url`) and `tags`. `create_asset` makes assets
workspace-visible; every workspace member (not viewer) creates and edits
them, and the owner or a workspace owner/admin deletes them. The owner is
the entity's `owner_id` and can be any workspace member (trigger
`entities_guard_owner`).

Only datasets have `dataset_columns` (composite FK on the kind);
`set_dataset_columns` replaces them in order, matching by name so ids (and
later column comments) survive edits. `project_assets` links an asset to a
project of the same workspace; project leads/contributors (and workspace
owners/admins) link and unlink, and a link is visible only to someone who can
see both sides.

### Dataset files & schema history (C11)

- `dataset_files`: immutable file versions of a dataset (highest = current).
  Objects live in the private Storage bucket `dataset-files` (50 MB, CSV and
  Parquet) at `{workspace}/{asset}/{file}/{safe name}`; Storage RLS reuses
  `can_read_entity` / `can_write_entity` through
  `private.dataset_file_asset(name)`, and a trigger requires the object to
  exist before a row points at it (size taken from Storage). Users never
  update or delete objects: the service role (scoped by workspace) purges
  objects beyond the newest 10 (`purged_at`) and removes them when the
  dataset is deleted. Uploads that are never committed leave orphan objects
  (accepted until a cleanup job exists).
- `dataset_schema_versions`: append-only snapshots of a dataset's columns,
  written by `set_dataset_columns` whenever the columns change (source
  `manual` or `file`); a per-dataset advisory lock keeps versions
  consecutive, and an empty schema is never the first snapshot.
- Upload flow: the browser parses the file (hyparquet reads the Parquet
  footer; papaparse streams CSV in chunks and infers types) → server action
  `prepareDatasetFileUpload` returns a signed upload URL → the browser PUTs
  the file to Storage → `commitDatasetFile` calls the `add_dataset_file`
  RPC, which records the version and applies the reviewed columns in one
  transaction. Files never pass through Next.js (request body limits).

### Lineage (C03)

`asset_edges` connects two assets of one workspace (composite FKs to
`assets (id, workspace_id)`); data always flows `from_asset` → `to_asset`.
`relation` is `feeds | reads | writes | derived_from`, `source` is
`manual | dbt | api`; one edge per `(from, to, relation)`, no self-edges,
cycles allowed. An edge is readable with both assets and added (users: only
`manual`) or removed by writers of both; edges are never updated.

`asset_lineage(root, direction, max_depth)` (`upstream | downstream | both`,
1–5) returns `{ nodes, edges }`: each node with its fewest-hop
`upstream_depth` / `downstream_depth`, and every edge walked. The public RPC
wraps `private.asset_lineage` (security definer): it raises 42501 unless the
caller can read the root, follows only the root's workspace, and never
enters an asset the caller cannot read (`can_read_entity_row` once per
reached node), which is what RLS on `asset_edges` would give at a fraction
of the cost. Each recursion level keeps `(id, depth)` once (`union`) and
stops at `max_depth`, so cycles neither loop nor explode into every path
(~40 ms at depth 5 on a 1,000-node graph with cycles).

The Lineage tab lays the result out with elkjs (`layered`, left to right)
and draws it with React Flow; nodes are links (the graph is not editable),
and the direct connections are repeated as lists with remove actions.

### RLS helper functions

All `security definer`, `stable`, `set search_path = ''`, fully-qualified names,
in schema `private` (not exposed through PostgREST) with `execute` granted to
`authenticated`:

- `private.is_workspace_member(ws uuid) → boolean`
- `private.workspace_role(ws uuid) → public.workspace_role` (null if not a member)
- `private.can_read_entity(e uuid) → boolean`
- `private.can_write_entity(e uuid) → boolean` (readable AND role ≥ `member`;
  a project also needs `can_edit_project`)
- `private.can_read_entity_row(ws, owner, vis, project)` /
  `private.can_write_entity_row(e, ws, owner, vis, project, type)`: the same
  rules from the row's own columns, used by the `entities` policies so
  `insert … returning` works
- `private.project_role(p uuid) → public.project_role` (null if not a member)
- `private.can_edit_project(p uuid)` (lead/contributor) and
  `private.can_manage_project(p uuid)` (lead), both true for workspace
  owners/admins and false for workspace viewers

Policies call these helpers wrapped in `(select …)` so Postgres caches the result
per statement.

## 5. Conventions

- **Migrations** are forward-only, numbered `NNNN_description.sql` by the CLI
  timestamp; every table gets `alter table … enable row level security` in the
  same migration that creates it.
- **One database, in the cloud.** Dev, tests and CI all use the Supabase Cloud
  project `tessera` (ref `ijhtgvmcyrzmkmfiavnu`); there is no local Supabase
  stack and no Docker. A migration is written as a file first
  (`pnpm supabase migration new <name>`), then applied with `pnpm db:push` or
  the Supabase MCP `apply_migration` (then rename the file to the version the
  cloud recorded, so both match). Because deployed code and open PRs share the
  same database, migrations must be backward compatible (expand → migrate →
  contract); destructive changes need an explicit plan in the PR. Tests create
  their own fixtures and clean them up; they never rely on seed data.
- **Timestamps** are `timestamptz`, stored in UTC; display in the workspace
  timezone. CI runs with `TZ=UTC`.
- **IDs** are `uuid default gen_random_uuid()`.
- **Env**: `src/env.ts` validates every variable with Zod at boot; `.env.example`
  lists all of them.
- **Routes**: `/w/[workspace]/…` for workspace-scoped UI, `/u/[handle]` for
  profiles, `/api/v1/…` for the public API.
- **Definition of done**: see [roadmap Appendix C](../roadmap.md#appendix-c--definition-of-done-every-issue).
