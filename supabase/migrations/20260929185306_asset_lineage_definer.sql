-- C03 — faster lineage walk.
--
-- Under security invoker, every edge the walk touches ran the `asset_edges`
-- select policy (two `can_read_entity` lookups) and every node join ran the
-- `assets` and `entities` policies: ~190 ms at depth 5 on a 1,000-node graph
-- against ~16 ms without RLS. The walk now lives in
-- `private.asset_lineage` (security definer) and applies the same read rule
-- itself, once per node it reaches, from the entity's own columns
-- (`private.can_read_entity_row`):
--
-- * the caller must be able to read the root (else 42501, as before);
-- * only edges of the root's workspace are followed;
-- * the walk never enters an asset the caller cannot read, so neither the
--   asset nor its edges (nor anything reached only through it) come back —
--   exactly what RLS on `asset_edges` gave.
--
-- `public.asset_lineage` keeps its signature and result shape and becomes a
-- security-invoker wrapper.

create function private.asset_lineage(
  root uuid,
  direction text,
  max_depth integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ws uuid;
  result jsonb;
begin
  if asset_lineage.direction is null
    or asset_lineage.direction not in ('upstream', 'downstream', 'both') then
    raise exception 'direction must be upstream, downstream or both'
      using errcode = '22023';
  end if;
  if asset_lineage.max_depth is null or asset_lineage.max_depth not between 1 and 5 then
    raise exception 'max_depth must be between 1 and 5' using errcode = '22023';
  end if;

  select a.workspace_id into ws
  from public.assets a
  join public.entities en on en.id = a.id
  where a.id = asset_lineage.root
    and private.can_read_entity_row(en.workspace_id, en.owner_id, en.visibility, en.project_id);
  if ws is null then
    raise exception 'asset not found' using errcode = '42501';
  end if;

  with recursive
  up (id, depth) as (
    select asset_lineage.root, 0
    where asset_lineage.direction in ('upstream', 'both')
    union
    select e.from_asset, up.depth + 1
    from up
    join public.asset_edges e on e.to_asset = up.id and e.workspace_id = ws
    join public.entities en on en.id = e.from_asset
    where up.depth < asset_lineage.max_depth
      and private.can_read_entity_row(en.workspace_id, en.owner_id, en.visibility, en.project_id)
  ),
  down (id, depth) as (
    select asset_lineage.root, 0
    where asset_lineage.direction in ('downstream', 'both')
    union
    select e.to_asset, down.depth + 1
    from down
    join public.asset_edges e on e.from_asset = down.id and e.workspace_id = ws
    join public.entities en on en.id = e.to_asset
    where down.depth < asset_lineage.max_depth
      and private.can_read_entity_row(en.workspace_id, en.owner_id, en.visibility, en.project_id)
  ),
  up_nodes as (
    select up.id, min(up.depth) as depth from up group by up.id
  ),
  down_nodes as (
    select down.id, min(down.depth) as depth from down group by down.id
  ),
  nodes as (
    select
      coalesce(u.id, d.id) as id,
      u.depth as upstream_depth,
      d.depth as downstream_depth
    from up_nodes u
    full join down_nodes d on d.id = u.id
  ),
  -- Edges walked: into an expanded upstream node from a reached one, out of
  -- an expanded downstream node to a reached one.
  walked as (
    select e.*
    from public.asset_edges e
    join up_nodes u on u.id = e.to_asset
    join up_nodes f on f.id = e.from_asset
    where e.workspace_id = ws
      and u.depth < asset_lineage.max_depth
    union
    select e.*
    from public.asset_edges e
    join down_nodes d on d.id = e.from_asset
    join down_nodes t on t.id = e.to_asset
    where e.workspace_id = ws
      and d.depth < asset_lineage.max_depth
  )
  select jsonb_build_object(
    'nodes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'kind', a.kind,
          'name', en.title,
          'qualified_name', a.qualified_name::text,
          'upstream_depth', case when n.id = asset_lineage.root then 0 else n.upstream_depth end,
          'downstream_depth', case when n.id = asset_lineage.root then 0 else n.downstream_depth end
        )
        order by coalesce(n.upstream_depth, n.downstream_depth), en.title
      )
      from nodes n
      join public.assets a on a.id = n.id
      join public.entities en on en.id = a.id
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', w.id,
          'from', w.from_asset,
          'to', w.to_asset,
          'relation', w.relation,
          'source', w.source
        )
        order by w.created_at, w.id
      )
      from walked w
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

revoke execute on function private.asset_lineage(uuid, text, integer) from public, anon;
grant execute on function private.asset_lineage(uuid, text, integer) to authenticated, service_role;

create or replace function public.asset_lineage(
  root uuid,
  direction text default 'both',
  max_depth integer default 2
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.asset_lineage(asset_lineage.root, asset_lineage.direction, asset_lineage.max_depth);
$$;
