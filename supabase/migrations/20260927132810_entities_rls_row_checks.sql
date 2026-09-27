-- F04 — entities policies evaluate the row's own columns.
--
-- The select/update policies called `private.can_read_entity(id)` and
-- `private.can_write_entity(id)`, which look the row up by id. During
-- `insert … returning` (supabase-js `.insert().select()`) the function's
-- snapshot cannot see the row being inserted, so the RETURNING check failed
-- with "new row violates row-level security policy" even for the owner.
--
-- The new helpers take the row's columns instead. The id-based helpers stay
-- (backward compatible) for tables that reference an entity by id.

-- Same rules as `private.can_read_entity`:
-- private   → owner only
-- project   → owner, or workspace owner/admin (C01 adds project members)
-- workspace → every workspace member
create function private.can_read_entity_row(
  ws uuid,
  owner uuid,
  vis public.visibility
)
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
      and (
        owner = (select auth.uid())
        or vis = 'workspace'
        or (vis = 'project' and m.role in ('owner', 'admin'))
      )
  );
$$;

-- Readable AND workspace role >= member.
create function private.can_write_entity_row(
  ws uuid,
  owner uuid,
  vis public.visibility
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_read_entity_row(ws, owner, vis)
    and (select private.workspace_role(ws)) in ('owner', 'admin', 'member');
$$;

revoke execute on function
  private.can_read_entity_row(uuid, uuid, public.visibility),
  private.can_write_entity_row(uuid, uuid, public.visibility)
from public, anon;

grant execute on function
  private.can_read_entity_row(uuid, uuid, public.visibility),
  private.can_write_entity_row(uuid, uuid, public.visibility)
to authenticated, service_role;

alter policy "entities: readable per visibility"
  on public.entities
  using (private.can_read_entity_row(workspace_id, owner_id, visibility));

alter policy "entities: writers can update"
  on public.entities
  using (private.can_write_entity_row(workspace_id, owner_id, visibility));
