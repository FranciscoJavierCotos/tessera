-- C02 — asset catalog core: assets, dataset columns and project links.
--
-- * `assets` extends `entities` (type `asset`): the entity holds the name
--   (`title`), owner and visibility; `assets` holds the kind, the
--   `qualified_name` (unique per workspace, case-insensitive), a markdown
--   description, kind-specific `properties` and `tags`. The composite FK
--   `(id, workspace_id, type)` pins the entity's type and workspace.
-- * Assets are a shared inventory: `create_asset` makes them
--   workspace-visible. Reads follow the generic entity visibility rules, so
--   existing private `asset` entities (RLS fixtures) stay valid. Any
--   workspace member (not viewer) creates and edits them; the owner or a
--   workspace owner/admin deletes them (the existing `entities` delete
--   policy).
-- * An entity's owner must belong to its workspace (trigger), so the owner
--   of an asset can be handed to any teammate.
-- * An asset's kind never changes (trigger). `dataset_columns` only attach to
--   datasets (composite FK on `(asset_id, workspace_id, asset_kind)`).
-- * `project_assets` links assets to projects of the same workspace
--   (composite FKs). Project editors (lead/contributor, workspace
--   owner/admin) link and unlink; a link is visible to whoever sees both
--   sides.
-- * View `catalog_assets` (security invoker: RLS of the base tables applies)
--   flattens an asset, its entity and owner for the catalog list.
-- * RPCs `create_asset`, `update_asset` and `set_dataset_columns` write in one
--   transaction (security invoker: RLS applies).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.asset_kind as enum ('dataset', 'dashboard', 'source_system', 'ml_model');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- At most 20 tags of 1–32 lowercase letters, digits, `_` or `-`.
create function private.valid_tags(tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(tags), 0) <= 20
    and coalesce(
      (select bool_and(t ~ '^[a-z0-9][a-z0-9_-]{0,31}$') from unnest(tags) as t),
      true
    );
$$;

revoke execute on function private.valid_tags(text[]) from public, anon;
grant execute on function private.valid_tags(text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.assets (
  id uuid primary key,
  workspace_id uuid not null,
  type public.entity_type not null default 'asset'
    constraint assets_type_is_asset check (type = 'asset'),
  kind public.asset_kind not null,
  qualified_name extensions.citext not null
    constraint assets_qualified_name_format check (
      char_length(qualified_name::text) between 1 and 255
      and qualified_name::text !~ '[[:space:]/?#%\\]'
      and qualified_name::text not in ('new')
    ),
  description text not null default ''
    constraint assets_description_length check (char_length(description) <= 20000),
  properties jsonb not null default '{}'
    constraint assets_properties_object check (
      jsonb_typeof(properties) = 'object' and pg_column_size(properties) <= 16384
    ),
  tags text[] not null default '{}'
    constraint assets_tags_valid check (private.valid_tags(tags)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_entity_fk foreign key (id, workspace_id, type)
    references public.entities (id, workspace_id, type) on delete cascade,
  constraint assets_workspace_qualified_name_key unique (workspace_id, qualified_name),
  -- Targets of the composite FKs from `project_assets` and `dataset_columns`.
  constraint assets_id_workspace_key unique (id, workspace_id),
  constraint assets_id_workspace_kind_key unique (id, workspace_id, kind)
);

create index assets_id_workspace_id_type_idx on public.assets (id, workspace_id, type);
create index assets_workspace_id_kind_idx on public.assets (workspace_id, kind);
create index assets_tags_idx on public.assets using gin (tags);

create table public.dataset_columns (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  workspace_id uuid not null,
  asset_kind public.asset_kind not null default 'dataset'
    constraint dataset_columns_kind_is_dataset check (asset_kind = 'dataset'),
  name extensions.citext not null
    constraint dataset_columns_name_length check (
      char_length(btrim(name::text)) between 1 and 255
    ),
  data_type text not null default ''
    constraint dataset_columns_data_type_length check (char_length(data_type) <= 100),
  description text not null default ''
    constraint dataset_columns_description_length check (char_length(description) <= 5000),
  is_pii boolean not null default false,
  ordinal integer not null
    constraint dataset_columns_ordinal_positive check (ordinal >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dataset_columns_asset_fk foreign key (asset_id, workspace_id, asset_kind)
    references public.assets (id, workspace_id, kind) on delete cascade,
  constraint dataset_columns_asset_name_key unique (asset_id, name)
);

create index dataset_columns_asset_id_workspace_id_asset_kind_idx
  on public.dataset_columns (asset_id, workspace_id, asset_kind);

create table public.project_assets (
  project_id uuid not null,
  asset_id uuid not null,
  workspace_id uuid not null,
  added_by uuid default auth.uid() references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (project_id, asset_id),
  constraint project_assets_project_fk foreign key (project_id, workspace_id)
    references public.projects (id, workspace_id) on delete cascade,
  constraint project_assets_asset_fk foreign key (asset_id, workspace_id)
    references public.assets (id, workspace_id) on delete cascade
);

create index project_assets_project_id_workspace_id_idx
  on public.project_assets (project_id, workspace_id);
create index project_assets_asset_id_workspace_id_idx
  on public.project_assets (asset_id, workspace_id);
create index project_assets_added_by_idx on public.project_assets (added_by);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger assets_set_updated_at
  before update on public.assets
  for each row execute function private.set_updated_at();

create trigger dataset_columns_set_updated_at
  before update on public.dataset_columns
  for each row execute function private.set_updated_at();

-- An asset's kind never changes (a dataset does not become a dashboard).
create function private.assets_prevent_kind_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'assets.kind is immutable'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger assets_prevent_kind_change
  before update of kind on public.assets
  for each row execute function private.assets_prevent_kind_change();

-- An entity's owner is a member of its workspace. Security definer: the
-- caller may not see every membership row it needs to check.
create function private.entities_guard_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = new.workspace_id
      and m.user_id = new.owner_id
  ) then
    raise exception 'the owner must be a member of the workspace'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger entities_guard_owner
  before update of owner_id on public.entities
  for each row
  when (new.owner_id is distinct from old.owner_id)
  execute function private.entities_guard_owner();

revoke execute on function
  private.assets_prevent_kind_change(),
  private.entities_guard_owner()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security (default deny)
-- ---------------------------------------------------------------------------

alter table public.assets enable row level security;
alter table public.dataset_columns enable row level security;
alter table public.project_assets enable row level security;

revoke all on table public.assets, public.dataset_columns, public.project_assets from anon;

-- An asset is deleted through its entity; its identity columns never move.
revoke delete, update on table public.assets from authenticated;
grant update (qualified_name, description, properties, tags)
  on table public.assets to authenticated;

-- A column never moves to another asset.
revoke update on table public.dataset_columns from authenticated;
grant update (name, data_type, description, is_pii, ordinal)
  on table public.dataset_columns to authenticated;

-- A link is added or removed, never edited.
revoke update on table public.project_assets from authenticated;

-- assets --------------------------------------------------------------------

create policy "assets: readable per entity visibility"
  on public.assets for select to authenticated
  using ((select private.can_read_entity(id)));

create policy "assets: writers of the entity create the asset"
  on public.assets for insert to authenticated
  with check ((select private.can_write_entity(id)));

create policy "assets: writers can update"
  on public.assets for update to authenticated
  using ((select private.can_write_entity(id)))
  with check ((select private.can_write_entity(id)));

-- dataset_columns -----------------------------------------------------------

create policy "dataset_columns: readable with the asset"
  on public.dataset_columns for select to authenticated
  using ((select private.can_read_entity(asset_id)));

create policy "dataset_columns: asset writers add"
  on public.dataset_columns for insert to authenticated
  with check ((select private.can_write_entity(asset_id)));

create policy "dataset_columns: asset writers update"
  on public.dataset_columns for update to authenticated
  using ((select private.can_write_entity(asset_id)))
  with check ((select private.can_write_entity(asset_id)));

create policy "dataset_columns: asset writers remove"
  on public.dataset_columns for delete to authenticated
  using ((select private.can_write_entity(asset_id)));

-- project_assets ------------------------------------------------------------

create policy "project_assets: readable with the project and the asset"
  on public.project_assets for select to authenticated
  using (
    (select private.can_read_entity(project_id))
    and (select private.can_read_entity(asset_id))
  );

create policy "project_assets: project editors link readable assets"
  on public.project_assets for insert to authenticated
  with check (
    (select private.can_edit_project(project_id))
    and (select private.can_read_entity(asset_id))
    and added_by = (select auth.uid())
  );

create policy "project_assets: project editors unlink"
  on public.project_assets for delete to authenticated
  using ((select private.can_edit_project(project_id)));

-- ---------------------------------------------------------------------------
-- View: the catalog list (security invoker, so RLS of the base tables applies)
-- ---------------------------------------------------------------------------

create view public.catalog_assets
with (security_invoker = true)
as
select
  a.id,
  a.workspace_id,
  a.kind,
  en.title as name,
  a.qualified_name::text as qualified_name,
  a.description,
  a.tags,
  a.properties,
  en.owner_id,
  p.display_name as owner_name,
  p.handle::text as owner_handle,
  (
    select count(*)::integer
    from public.dataset_columns dc
    where dc.asset_id = a.id
  ) as column_count,
  (
    select count(*)::integer
    from public.dataset_columns dc
    where dc.asset_id = a.id
      and dc.is_pii
  ) as pii_column_count,
  coalesce(
    (
      select array_agg(pa.project_id order by pa.added_at)
      from public.project_assets pa
      where pa.asset_id = a.id
    ),
    '{}'
  ) as project_ids,
  a.created_at,
  greatest(a.updated_at, en.updated_at) as updated_at
from public.assets a
join public.entities en on en.id = a.id
left join public.profiles p on p.id = en.owner_id;

revoke all on table public.catalog_assets from anon;
grant select on table public.catalog_assets to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPCs (security invoker: every write goes through RLS as the caller)
-- ---------------------------------------------------------------------------

-- Replaces a dataset's columns with `columns`: a JSON array of
-- `{name, data_type, description, is_pii}` in display order. Columns are
-- matched by name (case-insensitive), so their ids survive an edit; missing
-- ones are removed.
create function public.set_dataset_columns(asset uuid, columns jsonb)
returns setof public.dataset_columns
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ws uuid;
begin
  if jsonb_typeof(set_dataset_columns.columns) is distinct from 'array' then
    raise exception 'columns must be a JSON array' using errcode = '22023';
  end if;

  select a.workspace_id into ws
  from public.assets a
  where a.id = set_dataset_columns.asset
    and a.kind = 'dataset';
  if ws is null or not private.can_write_entity(set_dataset_columns.asset) then
    raise exception 'dataset not found or not editable' using errcode = '42501';
  end if;

  delete from public.dataset_columns dc
  where dc.asset_id = set_dataset_columns.asset
    and dc.name not in (
      select (c ->> 'name')::extensions.citext
      from jsonb_array_elements(set_dataset_columns.columns) as c
      where c ->> 'name' is not null
    );

  insert into public.dataset_columns as dc
    (asset_id, workspace_id, name, data_type, description, is_pii, ordinal)
  select
    set_dataset_columns.asset,
    ws,
    btrim(c.value ->> 'name'),
    coalesce(btrim(c.value ->> 'data_type'), ''),
    coalesce(btrim(c.value ->> 'description'), ''),
    coalesce((c.value ->> 'is_pii')::boolean, false),
    (c.ordinality - 1)::integer
  from jsonb_array_elements(set_dataset_columns.columns) with ordinality as c(value, ordinality)
  on conflict (asset_id, name) do update
  set
    name = excluded.name,
    data_type = excluded.data_type,
    description = excluded.description,
    is_pii = excluded.is_pii,
    ordinal = excluded.ordinal;

  return query
  select dc.*
  from public.dataset_columns dc
  where dc.asset_id = set_dataset_columns.asset
  order by dc.ordinal;
end;
$$;

create function public.create_asset(
  workspace uuid,
  kind public.asset_kind,
  name text,
  qualified_name text,
  description text default '',
  owner uuid default null,
  tags text[] default '{}',
  properties jsonb default '{}',
  columns jsonb default null
)
returns public.assets
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid := gen_random_uuid();
  result public.assets;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- The caller creates the entity (RLS: owner = caller), then hands it over.
  insert into public.entities (id, workspace_id, type, title, visibility, owner_id)
  values (new_id, create_asset.workspace, 'asset', create_asset.name, 'workspace', (select auth.uid()));

  insert into public.assets (id, workspace_id, kind, qualified_name, description, properties, tags)
  values (
    new_id,
    create_asset.workspace,
    create_asset.kind,
    create_asset.qualified_name,
    create_asset.description,
    create_asset.properties,
    create_asset.tags
  );

  if create_asset.owner is not null and create_asset.owner <> (select auth.uid()) then
    update public.entities en set owner_id = create_asset.owner where en.id = new_id;
  end if;

  if create_asset.columns is not null then
    perform public.set_dataset_columns(new_id, create_asset.columns);
  end if;

  select a.* into result from public.assets a where a.id = new_id;
  return result;
end;
$$;

-- `columns` null leaves a dataset's columns as they are.
create function public.update_asset(
  asset uuid,
  name text,
  qualified_name text,
  description text,
  owner uuid,
  tags text[],
  properties jsonb,
  columns jsonb default null
)
returns public.assets
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.assets;
begin
  update public.entities en
  set
    title = update_asset.name,
    owner_id = coalesce(update_asset.owner, en.owner_id)
  where en.id = update_asset.asset
    and en.type = 'asset';
  if not found then
    raise exception 'asset not found or not editable' using errcode = '42501';
  end if;

  update public.assets a
  set
    qualified_name = update_asset.qualified_name,
    description = update_asset.description,
    tags = update_asset.tags,
    properties = update_asset.properties
  where a.id = update_asset.asset;
  if not found then
    raise exception 'asset not found or not editable' using errcode = '42501';
  end if;

  if update_asset.columns is not null then
    perform public.set_dataset_columns(update_asset.asset, update_asset.columns);
  end if;

  select a.* into result from public.assets a where a.id = update_asset.asset;
  return result;
end;
$$;

revoke execute on function
  public.set_dataset_columns(uuid, jsonb),
  public.create_asset(uuid, public.asset_kind, text, text, text, uuid, text[], jsonb, jsonb),
  public.update_asset(uuid, text, text, text, uuid, text[], jsonb, jsonb)
from public, anon;

grant execute on function
  public.set_dataset_columns(uuid, jsonb),
  public.create_asset(uuid, public.asset_kind, text, text, text, uuid, text[], jsonb, jsonb),
  public.update_asset(uuid, text, text, text, uuid, text[], jsonb, jsonb)
to authenticated, service_role;
