-- C02 — `set_dataset_columns` matched existing columns case-sensitively:
-- with `search_path = ''` the citext `=` operator (schema `extensions`) is
-- not found, so `citext not in (citext)` fell back to text equality and a
-- column renamed only in case was deleted and re-created (new id). Compare
-- lowercased names instead; the unique index still uses citext semantics.

create or replace function public.set_dataset_columns(asset uuid, columns jsonb)
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

  return query
  select dc.*
  from public.dataset_columns dc
  where dc.asset_id = set_dataset_columns.asset
  order by dc.ordinal;
end;
$$;
