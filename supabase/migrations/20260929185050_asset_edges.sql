-- C03 — asset graph & lineage.
--
-- * `asset_edges` links two assets of the same workspace (composite FKs).
--   Data always flows `from_asset` → `to_asset`: `from_asset` is upstream.
--   `relation` says how (`feeds`, `reads`, `writes`, `derived_from`) and
--   `source` where the edge came from (`manual` from the UI; `dbt` and `api`
--   are written by later imports). One edge per `(from, to, relation)`; an
--   asset never links to itself. Cycles are allowed (real pipelines have
--   them) and the lineage walk copes with them.
-- * An edge is visible to whoever can read both assets; writers of both
--   assets (workspace role ≥ member) add and remove it. Edges are never
--   edited: remove and re-add.
-- * `asset_lineage(root, direction, max_depth)` walks the graph breadth-first
--   up to `max_depth` (1–5) hops upstream, downstream or both. Each level
--   keeps a node once (`union` on `(id, depth)` and the depth bound), so a
--   cycle cannot loop forever nor blow up into every path. Security invoker:
--   RLS hides edges to assets the caller cannot read.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.asset_relation as enum ('feeds', 'reads', 'writes', 'derived_from');
create type public.edge_source as enum ('manual', 'dbt', 'api');

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.asset_edges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  from_asset uuid not null,
  to_asset uuid not null,
  relation public.asset_relation not null default 'feeds',
  source public.edge_source not null default 'manual',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint asset_edges_from_fk foreign key (from_asset, workspace_id)
    references public.assets (id, workspace_id) on delete cascade,
  constraint asset_edges_to_fk foreign key (to_asset, workspace_id)
    references public.assets (id, workspace_id) on delete cascade,
  constraint asset_edges_not_self check (from_asset <> to_asset),
  constraint asset_edges_from_to_relation_key unique (from_asset, to_asset, relation)
);

-- The unique key serves downstream walks (by `from_asset`); this one serves
-- upstream walks (by `to_asset`) and the `to` FK.
create index asset_edges_to_asset_from_asset_idx on public.asset_edges (to_asset, from_asset);
create index asset_edges_from_asset_workspace_id_idx on public.asset_edges (from_asset, workspace_id);
create index asset_edges_to_asset_workspace_id_idx on public.asset_edges (to_asset, workspace_id);
create index asset_edges_created_by_idx on public.asset_edges (created_by);

-- ---------------------------------------------------------------------------
-- Row level security (default deny)
-- ---------------------------------------------------------------------------

alter table public.asset_edges enable row level security;

revoke all on table public.asset_edges from anon;
-- An edge is added or removed, never edited.
revoke update on table public.asset_edges from authenticated;

create policy "asset_edges: readable with both assets"
  on public.asset_edges for select to authenticated
  using (
    private.can_read_entity(from_asset)
    and private.can_read_entity(to_asset)
  );

create policy "asset_edges: writers of both assets add manual edges"
  on public.asset_edges for insert to authenticated
  with check (
    private.can_write_entity(from_asset)
    and private.can_write_entity(to_asset)
    and source = 'manual'
    and created_by = (select auth.uid())
  );

create policy "asset_edges: writers of both assets remove"
  on public.asset_edges for delete to authenticated
  using (
    private.can_write_entity(from_asset)
    and private.can_write_entity(to_asset)
  );

-- ---------------------------------------------------------------------------
-- RPC: the lineage around an asset
-- ---------------------------------------------------------------------------

-- Returns `{ nodes, edges }`:
-- * `nodes`: `{ id, kind, name, qualified_name, upstream_depth,
--   downstream_depth }`; the root has both depths 0 (whatever the
--   direction), other nodes the fewest hops at which they were reached in
--   each direction (or null).
-- * `edges`: `{ id, from, to, relation, source }` for every edge walked.
-- `direction` is `upstream`, `downstream` or `both`; `max_depth` is 1–5.
-- An unreadable or unknown root raises 42501.
create function public.asset_lineage(
  root uuid,
  direction text default 'both',
  max_depth integer default 2
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
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
  if not exists (select 1 from public.assets a where a.id = asset_lineage.root) then
    raise exception 'asset not found' using errcode = '42501';
  end if;

  with recursive
  up (id, depth) as (
    select asset_lineage.root, 0
    where asset_lineage.direction in ('upstream', 'both')
    union
    select e.from_asset, up.depth + 1
    from up
    join public.asset_edges e on e.to_asset = up.id
    where up.depth < asset_lineage.max_depth
  ),
  down (id, depth) as (
    select asset_lineage.root, 0
    where asset_lineage.direction in ('downstream', 'both')
    union
    select e.to_asset, down.depth + 1
    from down
    join public.asset_edges e on e.from_asset = down.id
    where down.depth < asset_lineage.max_depth
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
  -- Edges walked: into an upstream node that was expanded, out of a
  -- downstream node that was expanded.
  walked as (
    select e.*
    from public.asset_edges e
    join up_nodes u on u.id = e.to_asset
    where u.depth < asset_lineage.max_depth
    union
    select e.*
    from public.asset_edges e
    join down_nodes d on d.id = e.from_asset
    where d.depth < asset_lineage.max_depth
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

revoke execute on function public.asset_lineage(uuid, text, integer) from public, anon;
grant execute on function public.asset_lineage(uuid, text, integer) to authenticated, service_role;
