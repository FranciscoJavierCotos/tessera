-- F03 — core schema: profiles, workspaces, members, invites, entities.
--
-- Default-deny: RLS is enabled on every table in this migration and access is
-- granted only through the policies below. Policy helpers live in schema
-- `private` (not exposed through PostgREST), are `security definer` with
-- `search_path = ''`, and use fully-qualified names only.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.workspace_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.discipline as enum (
  'data_analyst',
  'data_scientist',
  'data_engineer',
  'analytics_engineer',
  'lead'
);
-- Extended by later migrations (quality_test, incident, ...).
create type public.entity_type as enum ('project', 'asset', 'page');
create type public.visibility as enum ('private', 'project', 'workspace');

-- ---------------------------------------------------------------------------
-- Private schema (helpers and trigger functions; never exposed via the API)
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Functions created later in `private` are not executable by default.
alter default privileges in schema private revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle extensions.citext unique
    constraint profiles_handle_format check (handle::text ~ '^[a-z0-9_]{3,30}$'),
  display_name text
    constraint profiles_display_name_length check (char_length(display_name) <= 100),
  discipline public.discipline,
  bio text constraint profiles_bio_length check (char_length(bio) <= 2000),
  skills text[] not null default '{}',
  avatar_path text,
  links jsonb not null default '[]'::jsonb
    constraint profiles_links_is_array check (jsonb_typeof(links) = 'array'),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.handle is
  'Unique lowercase handle; null until onboarding (F06).';

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug extensions.citext not null unique
    constraint workspaces_slug_format check (slug::text ~ '^[a-z0-9-]{3,40}$'),
  name text not null
    constraint workspaces_name_length check (char_length(btrim(name)) between 1 and 100),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create index workspaces_created_by_idx on public.workspaces (created_by);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.workspace_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email extensions.citext not null,
  role public.workspace_role not null default 'member',
  -- Hash of the invite token; the raw token is never stored.
  token_hash text not null unique,
  invited_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index invites_workspace_id_idx on public.invites (workspace_id);
create index invites_invited_by_idx on public.invites (invited_by);

create table public.entities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type public.entity_type not null,
  title text not null
    constraint entities_title_length check (char_length(btrim(title)) between 1 and 500),
  visibility public.visibility not null default 'workspace',
  project_id uuid,
  owner_id uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target of the composite FK below (a project must be in the same workspace).
  constraint entities_id_workspace_key unique (id, workspace_id),
  constraint entities_project_fk foreign key (project_id, workspace_id)
    references public.entities (id, workspace_id) on delete cascade,
  constraint entities_project_visibility_requires_project
    check (visibility <> 'project' or project_id is not null)
);

create index entities_workspace_id_type_idx on public.entities (workspace_id, type);
create index entities_owner_id_idx on public.entities (owner_id);
create index entities_project_id_workspace_id_idx on public.entities (project_id, workspace_id);

-- ---------------------------------------------------------------------------
-- RLS helpers (security definer: they read membership without recursing
-- through RLS). Policies call them wrapped in `(select ...)`.
-- ---------------------------------------------------------------------------

create function private.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = (select auth.uid())
  );
$$;

create function private.workspace_role(ws uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.workspace_members m
  where m.workspace_id = ws
    and m.user_id = (select auth.uid());
$$;

-- True when the current user and `other` share at least one workspace.
create function private.shares_workspace(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs
      on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = other
  );
$$;

-- private   → owner only
-- project   → owner, or workspace owner/admin (C01 adds project members)
-- workspace → every workspace member
create function private.can_read_entity(e uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.entities en
    join public.workspace_members m
      on m.workspace_id = en.workspace_id
     and m.user_id = (select auth.uid())
    where en.id = e
      and (
        en.owner_id = (select auth.uid())
        or en.visibility = 'workspace'
        or (en.visibility = 'project' and m.role in ('owner', 'admin'))
      )
  );
$$;

-- Readable AND workspace role >= member.
create function private.can_write_entity(e uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_read_entity(e)
    and exists (
      select 1
      from public.entities en
      join public.workspace_members m
        on m.workspace_id = en.workspace_id
       and m.user_id = (select auth.uid())
      where en.id = e
        and m.role in ('owner', 'admin', 'member')
    );
$$;

revoke execute on function
  private.is_workspace_member(uuid),
  private.workspace_role(uuid),
  private.shares_workspace(uuid),
  private.can_read_entity(uuid),
  private.can_write_entity(uuid)
from public, anon;

grant execute on function
  private.is_workspace_member(uuid),
  private.workspace_role(uuid),
  private.shares_workspace(uuid),
  private.can_read_entity(uuid),
  private.can_write_entity(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Every new auth user gets a profile; handle stays null until onboarding.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- The creator of a workspace becomes its owner, in the same transaction.
create function private.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_workspace_created
  after insert on public.workspaces
  for each row execute function private.handle_new_workspace();

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger entities_set_updated_at
  before update on public.entities
  for each row execute function private.set_updated_at();

-- An entity never moves between workspaces.
create function private.entities_prevent_workspace_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'entities.workspace_id is immutable'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger entities_prevent_workspace_change
  before update of workspace_id on public.entities
  for each row execute function private.entities_prevent_workspace_change();

revoke execute on function
  private.handle_new_user(),
  private.handle_new_workspace(),
  private.set_updated_at(),
  private.entities_prevent_workspace_change()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security (enabled on every table; default deny)
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.invites enable row level security;
alter table public.entities enable row level security;

-- The anonymous role has no business with any of these tables.
revoke all on table
  public.profiles,
  public.workspaces,
  public.workspace_members,
  public.invites,
  public.entities
from anon;

-- Profiles are only created by the auth trigger.
revoke insert, delete on table public.profiles from authenticated;

-- profiles ------------------------------------------------------------------

create policy "profiles: self or workspace peers can read"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.shares_workspace(id))
  );

create policy "profiles: users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- workspaces ----------------------------------------------------------------

create policy "workspaces: members can read"
  on public.workspaces for select to authenticated
  using ((select private.is_workspace_member(id)));

create policy "workspaces: authenticated users can create as themselves"
  on public.workspaces for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "workspaces: owners and admins can update"
  on public.workspaces for update to authenticated
  using ((select private.workspace_role(id)) in ('owner', 'admin'))
  with check ((select private.workspace_role(id)) in ('owner', 'admin'));

create policy "workspaces: owners can delete"
  on public.workspaces for delete to authenticated
  using ((select private.workspace_role(id)) = 'owner');

-- workspace_members ---------------------------------------------------------
-- Admins manage non-owner memberships; only owners grant or change `owner`.

create policy "workspace_members: members of the workspace can read"
  on public.workspace_members for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy "workspace_members: owners and admins can add"
  on public.workspace_members for insert to authenticated
  with check (
    (select private.workspace_role(workspace_id)) = 'owner'
    or ((select private.workspace_role(workspace_id)) = 'admin' and role <> 'owner')
  );

create policy "workspace_members: owners and admins can change roles"
  on public.workspace_members for update to authenticated
  using (
    (select private.workspace_role(workspace_id)) = 'owner'
    or ((select private.workspace_role(workspace_id)) = 'admin' and role <> 'owner')
  )
  with check (
    (select private.workspace_role(workspace_id)) = 'owner'
    or ((select private.workspace_role(workspace_id)) = 'admin' and role <> 'owner')
  );

create policy "workspace_members: owners and admins remove, anyone can leave"
  on public.workspace_members for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.workspace_role(workspace_id)) = 'owner'
    or ((select private.workspace_role(workspace_id)) = 'admin' and role <> 'owner')
  );

-- invites -------------------------------------------------------------------

create policy "invites: owners and admins can read"
  on public.invites for select to authenticated
  using ((select private.workspace_role(workspace_id)) in ('owner', 'admin'));

create policy "invites: owners and admins can invite"
  on public.invites for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and (
      (select private.workspace_role(workspace_id)) = 'owner'
      or ((select private.workspace_role(workspace_id)) = 'admin' and role <> 'owner')
    )
  );

create policy "invites: owners and admins can update"
  on public.invites for update to authenticated
  using ((select private.workspace_role(workspace_id)) in ('owner', 'admin'))
  with check (
    (select private.workspace_role(workspace_id)) = 'owner'
    or ((select private.workspace_role(workspace_id)) = 'admin' and role <> 'owner')
  );

create policy "invites: owners and admins can delete"
  on public.invites for delete to authenticated
  using ((select private.workspace_role(workspace_id)) in ('owner', 'admin'));

-- entities ------------------------------------------------------------------

create policy "entities: readable per visibility"
  on public.entities for select to authenticated
  using ((select private.can_read_entity(id)));

create policy "entities: members create entities they own"
  on public.entities for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select private.workspace_role(workspace_id)) in ('owner', 'admin', 'member')
  );

create policy "entities: writers can update"
  on public.entities for update to authenticated
  using ((select private.can_write_entity(id)))
  with check ((select private.workspace_role(workspace_id)) in ('owner', 'admin', 'member'));

create policy "entities: owner or workspace admin can delete"
  on public.entities for delete to authenticated
  using (
    (
      owner_id = (select auth.uid())
      and (select private.workspace_role(workspace_id)) in ('owner', 'admin', 'member')
    )
    or (select private.workspace_role(workspace_id)) in ('owner', 'admin')
  );

-- ---------------------------------------------------------------------------
-- RPC: create a workspace and its owner membership atomically.
-- Security invoker: the insert goes through RLS as the caller, and the
-- `on_workspace_created` trigger adds the owner row in the same transaction.
-- ---------------------------------------------------------------------------

create function public.create_workspace(name text, slug text)
returns public.workspaces
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid := gen_random_uuid();
  result public.workspaces;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- No RETURNING: the select policy only passes once the owner row exists,
  -- which the AFTER trigger inserts at the end of this statement.
  insert into public.workspaces (id, name, slug, created_by)
  values (new_id, create_workspace.name, create_workspace.slug, (select auth.uid()));

  select w.* into result from public.workspaces w where w.id = new_id;
  return result;
end;
$$;

revoke execute on function public.create_workspace(text, text) from public, anon;
grant execute on function public.create_workspace(text, text) to authenticated, service_role;
