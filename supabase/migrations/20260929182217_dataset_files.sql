-- C11 — dataset files & schema history.
--
-- * A dataset has file versions (`dataset_files`): every upload is a new,
--   immutable version; the highest is the current file. Objects live in the
--   private bucket `dataset-files` at `{workspace}/{asset}/{file}/{name}`.
--   The service role purges stored objects beyond the newest 10
--   (`purged_at`) and removes them when the dataset is deleted.
-- * `dataset_schema_versions` is the append-only history of a dataset's
--   columns. `set_dataset_columns` snapshots the columns after every write
--   that changes them (manual edits, `create_asset`, file uploads). An empty
--   schema is never the first snapshot.
-- * `add_dataset_file` records an uploaded object as the next file version
--   and applies its columns in one transaction. A trigger checks the object
--   exists at the row's path and takes its size from Storage.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.dataset_file_format as enum ('csv', 'parquet');
create type public.schema_change_source as enum ('manual', 'file');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.dataset_files (
  id uuid primary key,
  asset_id uuid not null,
  workspace_id uuid not null,
  asset_kind public.asset_kind not null default 'dataset'
    constraint dataset_files_kind_is_dataset check (asset_kind = 'dataset'),
  version integer not null
    constraint dataset_files_version_positive check (version >= 1),
  storage_path text not null
    constraint dataset_files_storage_path_key unique
    constraint dataset_files_storage_path_canonical check (
      split_part(storage_path, '/', 1) = workspace_id::text
      and split_part(storage_path, '/', 2) = asset_id::text
      and split_part(storage_path, '/', 3) = id::text
      and split_part(storage_path, '/', 4) ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'
      and split_part(storage_path, '/', 5) = ''
    ),
  filename text not null
    constraint dataset_files_filename_valid check (
      char_length(filename) between 1 and 255 and position('/' in filename) = 0
    ),
  format public.dataset_file_format not null,
  size_bytes bigint not null default 0
    constraint dataset_files_size_valid check (size_bytes between 0 and 52428800),
  row_count bigint
    constraint dataset_files_row_count_valid check (row_count >= 0),
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  purged_at timestamptz,
  constraint dataset_files_asset_fk foreign key (asset_id, workspace_id, asset_kind)
    references public.assets (id, workspace_id, kind) on delete cascade,
  constraint dataset_files_asset_version_key unique (asset_id, version)
);

create index dataset_files_asset_id_workspace_id_asset_kind_idx
  on public.dataset_files (asset_id, workspace_id, asset_kind);
create index dataset_files_uploaded_by_idx on public.dataset_files (uploaded_by);

create table public.dataset_schema_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  workspace_id uuid not null,
  asset_kind public.asset_kind not null default 'dataset'
    constraint dataset_schema_versions_kind_is_dataset check (asset_kind = 'dataset'),
  version integer not null
    constraint dataset_schema_versions_version_positive check (version >= 1),
  columns jsonb not null
    constraint dataset_schema_versions_columns_array check (jsonb_typeof(columns) = 'array'),
  source public.schema_change_source not null,
  file_id uuid references public.dataset_files (id) on delete set null
    constraint dataset_schema_versions_file_needs_file_source check (
      file_id is null or source = 'file'
    ),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint dataset_schema_versions_asset_fk foreign key (asset_id, workspace_id, asset_kind)
    references public.assets (id, workspace_id, kind) on delete cascade,
  constraint dataset_schema_versions_asset_version_key unique (asset_id, version)
);

create index dataset_schema_versions_asset_id_workspace_id_asset_kind_idx
  on public.dataset_schema_versions (asset_id, workspace_id, asset_kind);
create index dataset_schema_versions_file_id_idx on public.dataset_schema_versions (file_id);
create index dataset_schema_versions_created_by_idx on public.dataset_schema_versions (created_by);

-- ---------------------------------------------------------------------------
-- Storage: dataset-files
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dataset-files',
  'dataset-files',
  false,
  52428800, -- 50 MB (Supabase Free plan cap)
  array['text/csv', 'application/vnd.apache.parquet']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The dataset an object path `{workspace}/{asset}/{file}/{name}` belongs to,
-- or null when the path is malformed or the asset is not a dataset of that
-- workspace. Security definer: callers may not see the asset row.
create function private.dataset_file_asset(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folders text[] := storage.foldername(object_name);
  uuid_pattern constant text :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  result uuid;
begin
  if coalesce(array_length(folders, 1), 0) <> 3
     or folders[1] !~ uuid_pattern
     or folders[2] !~ uuid_pattern
     or folders[3] !~ uuid_pattern then
    return null;
  end if;
  select a.id into result
  from public.assets a
  where a.id = folders[2]::uuid
    and a.workspace_id = folders[1]::uuid
    and a.kind = 'dataset';
  return result;
end;
$$;

revoke execute on function private.dataset_file_asset(text) from public, anon;
grant execute on function private.dataset_file_asset(text) to authenticated, service_role;

create policy "dataset-files: readable with the dataset"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dataset-files'
    and private.can_read_entity(private.dataset_file_asset(name))
  );

create policy "dataset-files: dataset writers upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dataset-files'
    and private.can_write_entity(private.dataset_file_asset(name))
  );

-- No update or delete policies: versions are immutable, and only the service
-- role removes objects (retention, dataset deletion).

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- A file row points at an uploaded object; its size comes from Storage.
-- Security definer: reads `storage.objects` regardless of the caller.
create function private.dataset_files_require_object()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  object_size bigint;
begin
  select coalesce((o.metadata ->> 'size')::bigint, 0) into object_size
  from storage.objects o
  where o.bucket_id = 'dataset-files'
    and o.name = new.storage_path;
  if not found then
    raise exception 'the file was not uploaded' using errcode = 'P0002';
  end if;
  new.size_bytes := object_size;
  return new;
end;
$$;

create trigger dataset_files_require_object
  before insert on public.dataset_files
  for each row execute function private.dataset_files_require_object();

revoke execute on function private.dataset_files_require_object()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security (default deny)
-- ---------------------------------------------------------------------------

alter table public.dataset_files enable row level security;
alter table public.dataset_schema_versions enable row level security;

revoke all on table public.dataset_files, public.dataset_schema_versions from anon;
-- Append-only for users; the service role sets `purged_at`.
revoke update, delete on table public.dataset_files, public.dataset_schema_versions
  from authenticated;

create policy "dataset_files: readable with the dataset"
  on public.dataset_files for select to authenticated
  using ((select private.can_read_entity(asset_id)));

create policy "dataset_files: dataset writers add"
  on public.dataset_files for insert to authenticated
  with check (
    (select private.can_write_entity(asset_id))
    and uploaded_by = (select auth.uid())
  );

create policy "dataset_schema_versions: readable with the dataset"
  on public.dataset_schema_versions for select to authenticated
  using ((select private.can_read_entity(asset_id)));

create policy "dataset_schema_versions: dataset writers add"
  on public.dataset_schema_versions for insert to authenticated
  with check (
    (select private.can_write_entity(asset_id))
    and created_by = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- set_dataset_columns: now snapshots the schema
-- ---------------------------------------------------------------------------

drop function public.set_dataset_columns(uuid, jsonb);

-- Replaces a dataset's columns with `columns` (see C02) and, when the result
-- differs from the latest snapshot, records the next schema version.
-- `source = 'file'` requires `file_id`, a file of the same dataset.
create function public.set_dataset_columns(
  asset uuid,
  columns jsonb,
  source public.schema_change_source default 'manual',
  file_id uuid default null
)
returns setof public.dataset_columns
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ws uuid;
  snapshot jsonb;
  last_columns jsonb;
  last_version integer;
begin
  if jsonb_typeof(set_dataset_columns.columns) is distinct from 'array' then
    raise exception 'columns must be a JSON array' using errcode = '22023';
  end if;
  if (set_dataset_columns.source = 'file') <> (set_dataset_columns.file_id is not null) then
    raise exception 'a file change needs its file' using errcode = '22023';
  end if;

  select a.workspace_id into ws
  from public.assets a
  where a.id = set_dataset_columns.asset
    and a.kind = 'dataset';
  if ws is null or not private.can_write_entity(set_dataset_columns.asset) then
    raise exception 'dataset not found or not editable' using errcode = '42501';
  end if;

  if set_dataset_columns.file_id is not null and not exists (
    select 1 from public.dataset_files f
    where f.id = set_dataset_columns.file_id
      and f.asset_id = set_dataset_columns.asset
  ) then
    raise exception 'the file belongs to another dataset' using errcode = '22023';
  end if;

  -- One writer per dataset at a time, so versions stay consecutive.
  perform pg_advisory_xact_lock(hashtextextended('dataset:' || set_dataset_columns.asset::text, 0));

  delete from public.dataset_columns dc
  where dc.asset_id = set_dataset_columns.asset
    -- Lowercased on both sides: with `search_path = ''` the citext `=` is
    -- not found (see 20260929163740_dataset_columns_case_fix).
    and lower(dc.name::text) not in (
      select lower(btrim(c ->> 'name'))
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', dc.name::text,
        'data_type', dc.data_type,
        'description', dc.description,
        'is_pii', dc.is_pii
      )
      order by dc.ordinal
    ),
    '[]'::jsonb
  ) into snapshot
  from public.dataset_columns dc
  where dc.asset_id = set_dataset_columns.asset;

  select v.version, v.columns into last_version, last_columns
  from public.dataset_schema_versions v
  where v.asset_id = set_dataset_columns.asset
  order by v.version desc
  limit 1;

  if (last_version is null and snapshot <> '[]'::jsonb)
     or (last_version is not null and snapshot is distinct from last_columns) then
    insert into public.dataset_schema_versions
      (asset_id, workspace_id, version, columns, source, file_id)
    values (
      set_dataset_columns.asset,
      ws,
      coalesce(last_version, 0) + 1,
      snapshot,
      set_dataset_columns.source,
      set_dataset_columns.file_id
    );
  end if;

  return query
  select dc.*
  from public.dataset_columns dc
  where dc.asset_id = set_dataset_columns.asset
  order by dc.ordinal;
end;
$$;

-- ---------------------------------------------------------------------------
-- add_dataset_file
-- ---------------------------------------------------------------------------

-- Records the uploaded object at `storage_path` as the dataset's next file
-- version and applies `columns` (the reviewed schema) from it.
create function public.add_dataset_file(
  asset uuid,
  file_id uuid,
  storage_path text,
  filename text,
  format public.dataset_file_format,
  columns jsonb,
  row_count bigint default null
)
returns public.dataset_files
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ws uuid;
  next_version integer;
  result public.dataset_files;
begin
  select a.workspace_id into ws
  from public.assets a
  where a.id = add_dataset_file.asset
    and a.kind = 'dataset';
  if ws is null or not private.can_write_entity(add_dataset_file.asset) then
    raise exception 'dataset not found or not editable' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('dataset:' || add_dataset_file.asset::text, 0));

  select coalesce(max(f.version), 0) + 1 into next_version
  from public.dataset_files f
  where f.asset_id = add_dataset_file.asset;

  insert into public.dataset_files
    (id, asset_id, workspace_id, version, storage_path, filename, format, row_count)
  values (
    add_dataset_file.file_id,
    add_dataset_file.asset,
    ws,
    next_version,
    add_dataset_file.storage_path,
    add_dataset_file.filename,
    add_dataset_file.format,
    add_dataset_file.row_count
  )
  returning * into result;

  perform public.set_dataset_columns(
    add_dataset_file.asset,
    add_dataset_file.columns,
    'file',
    add_dataset_file.file_id
  );

  return result;
end;
$$;

revoke execute on function
  public.set_dataset_columns(uuid, jsonb, public.schema_change_source, uuid),
  public.add_dataset_file(uuid, uuid, text, text, public.dataset_file_format, jsonb, bigint)
from public, anon;

grant execute on function
  public.set_dataset_columns(uuid, jsonb, public.schema_change_source, uuid),
  public.add_dataset_file(uuid, uuid, text, text, public.dataset_file_format, jsonb, bigint)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Backfill: existing datasets start their history at v1
-- ---------------------------------------------------------------------------

insert into public.dataset_schema_versions
  (asset_id, workspace_id, version, columns, source, created_by)
select
  dc.asset_id,
  dc.workspace_id,
  1,
  jsonb_agg(
    jsonb_build_object(
      'name', dc.name::text,
      'data_type', dc.data_type,
      'description', dc.description,
      'is_pii', dc.is_pii
    )
    order by dc.ordinal
  ),
  'manual',
  null
from public.dataset_columns dc
group by dc.asset_id, dc.workspace_id;
