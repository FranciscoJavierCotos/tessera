-- C01 — projects and project members.
--
-- * `projects` extends `entities` (type `project`): the entity holds the name
--   (`title`), owner and visibility; `projects` holds slug, description,
--   status and `archived_at`. The composite FK `(id, workspace_id, type)`
--   pins the entity's type and workspace.
-- * Project visibility is `workspace` or `private`. A private project is an
--   entity with visibility `project` scoped to itself (`project_id = id`), so
--   the general rule "`project` visibility → members of `project_id`, plus
--   workspace owners/admins" covers it (check `entities_project_scope`).
-- * `project_members` (lead | contributor | viewer) must be members of the
--   project's workspace (composite FK; leaving the workspace cascades). The
--   creator becomes lead (trigger).
-- * Editing a project needs project role lead/contributor (or workspace
--   owner/admin) and workspace role >= member. Archiving, changing visibility
--   and managing members need lead (or workspace owner/admin).
-- * RPCs `create_project` / `update_project` write the entity and the
--   project row in one transaction (security invoker: RLS applies).
--
-- The id-based entity helpers are replaced in place (same signatures); the
-- row helpers gain the columns they now need and the old overloads are
-- dropped (only the entities policies used them).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.project_status as enum ('planning', 'active', 'paused', 'done');
create type public.project_role as enum ('lead', 'contributor', 'viewer');

-- ---------------------------------------------------------------------------
-- entities
-- ---------------------------------------------------------------------------

alter table public.entities
  -- Target of extension-table FKs that also pin the entity type.
  add constraint entities_id_workspace_type_key unique (id, workspace_id, type),
  -- Projects are workspace-visible, or private (scoped to themselves).
  add constraint entities_project_scope check (
    type <> 'project'
    or (visibility = 'workspace' and project_id is null)
    or (visibility = 'project' and project_id = id)
  );

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key,
  workspace_id uuid not null,
  type public.entity_type not null default 'project'
    constraint projects_type_is_project check (type = 'project'),
  slug extensions.citext not null
    constraint projects_slug_format check (slug::text ~ '^[a-z0-9-]{3,40}$')
    constraint projects_slug_not_reserved check (slug::text not in ('new')),
  description text not null default ''
    constraint projects_description_length check (char_length(description) <= 5000),
  status public.project_status not null default 'planning',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_entity_fk foreign key (id, workspace_id, type)
    references public.entities (id, workspace_id, type) on delete cascade,
  constraint projects_workspace_slug_key unique (workspace_id, slug),
  -- Target of the composite FK from `project_members`.
  constraint projects_id_workspace_key unique (id, workspace_id)
);

create table public.project_members (
  project_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.project_role not null default 'contributor',
  added_at timestamptz not null default now(),
  primary key (project_id, user_id),
  constraint project_members_project_fk foreign key (project_id, workspace_id)
    references public.projects (id, workspace_id) on delete cascade,
  -- Only workspace members can join; leaving the workspace removes them.
  constraint project_members_workspace_member_fk foreign key (workspace_id, user_id)
    references public.workspace_members (workspace_id, user_id) on delete cascade
);

create index project_members_user_id_idx on public.project_members (user_id);
create index project_members_workspace_id_user_id_idx
  on public.project_members (workspace_id, user_id);

-- ---------------------------------------------------------------------------
-- Helpers (security definer: they read membership without recursing
-- through RLS)
-- ---------------------------------------------------------------------------

create function private.project_role(p uuid)
returns public.project_role
language sql
stable
security definer
set search_path = ''
as $$
  select pm.role
  from public.project_members pm
  where pm.project_id = p
    and pm.user_id = (select auth.uid());
$$;

-- Workspace owner/admin, or a project member with one of `roles` whose
-- workspace role still allows writing (member).
create function private.has_project_access(
  p uuid,
  roles public.project_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects pr
    join public.workspace_members m
      on m.workspace_id = pr.workspace_id
     and m.user_id = (select auth.uid())
    where pr.id = p
      and (
        m.role in ('owner', 'admin')
        or (
          m.role = 'member'
          and exists (
            select 1
            from public.project_members pm
            where pm.project_id = p
              and pm.user_id = m.user_id
              and pm.role = any (roles)
          )
        )
      )
  );
$$;

-- Edit name, slug, description, status.
create function private.can_edit_project(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_project_access(p, array['lead', 'contributor']::public.project_role[]);
$$;

-- Archive, change visibility, manage members.
create function private.can_manage_project(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_project_access(p, array['lead']::public.project_role[]);
$$;

-- The caller owns the (project-typed) entity `p` and may create in its
-- workspace: the `projects` row of a project being created.
create function private.can_create_project(p uuid)
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
    where en.id = p
      and en.type = 'project'
      and en.owner_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'member')
  );
$$;

-- private   → owner only
-- project   → owner, workspace owner/admin, or a member of `project_id`
-- workspace → every workspace member
create or replace function private.can_read_entity(e uuid)
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
        or (
          en.visibility = 'project'
          and (
            m.role in ('owner', 'admin')
            or exists (
              select 1
              from public.project_members pm
              where pm.project_id = en.project_id
                and pm.user_id = m.user_id
            )
          )
        )
      )
  );
$$;

-- Readable AND workspace role >= member; projects also need edit access.
create or replace function private.can_write_entity(e uuid)
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
        and (en.type <> 'project' or private.can_edit_project(en.id))
    );
$$;

-- Same rules as `private.can_read_entity`, from the row's own columns.
create function private.can_read_entity_row(
  ws uuid,
  owner uuid,
  vis public.visibility,
  project uuid
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
        or (
          vis = 'project'
          and (
            m.role in ('owner', 'admin')
            or exists (
              select 1
              from public.project_members pm
              where pm.project_id = project
                and pm.user_id = m.user_id
            )
          )
        )
      )
  );
$$;

-- Same rules as `private.can_write_entity`, from the row's own columns.
create function private.can_write_entity_row(
  e uuid,
  ws uuid,
  owner uuid,
  vis public.visibility,
  project uuid,
  etype public.entity_type
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_read_entity_row(ws, owner, vis, project)
    and (select private.workspace_role(ws)) in ('owner', 'admin', 'member')
    and (etype <> 'project' or private.can_edit_project(e));
$$;

revoke execute on function
  private.project_role(uuid),
  private.has_project_access(uuid, public.project_role[]),
  private.can_edit_project(uuid),
  private.can_manage_project(uuid),
  private.can_create_project(uuid),
  private.can_read_entity_row(uuid, uuid, public.visibility, uuid),
  private.can_write_entity_row(uuid, uuid, uuid, public.visibility, uuid, public.entity_type)
from public, anon;

grant execute on function
  private.project_role(uuid),
  private.has_project_access(uuid, public.project_role[]),
  private.can_edit_project(uuid),
  private.can_manage_project(uuid),
  private.can_create_project(uuid),
  private.can_read_entity_row(uuid, uuid, public.visibility, uuid),
  private.can_write_entity_row(uuid, uuid, uuid, public.visibility, uuid, public.entity_type)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- entities policies: switch to the new row helpers, drop the old overloads
-- ---------------------------------------------------------------------------

alter policy "entities: readable per visibility"
  on public.entities
  using (private.can_read_entity_row(workspace_id, owner_id, visibility, project_id));

alter policy "entities: writers can update"
  on public.entities
  using (
    private.can_write_entity_row(id, workspace_id, owner_id, visibility, project_id, type)
  );

drop function private.can_write_entity_row(uuid, uuid, public.visibility);
drop function private.can_read_entity_row(uuid, uuid, public.visibility);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- The project's creator (the entity owner) becomes its lead.
create function private.handle_new_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_members (project_id, workspace_id, user_id, role)
  select new.id, new.workspace_id, en.owner_id, 'lead'
  from public.entities en
  where en.id = new.id;
  return new;
end;
$$;

create trigger on_project_created
  after insert on public.projects
  for each row execute function private.handle_new_project();

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function private.set_updated_at();

-- Only leads and workspace owners/admins archive or restore a project.
-- Skipped without a user (service role, migrations).
create function private.projects_guard_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and new.archived_at is distinct from old.archived_at
     and not private.can_manage_project(new.id) then
    raise exception 'only project leads can archive a project'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger projects_guard_archive
  before update of archived_at on public.projects
  for each row execute function private.projects_guard_archive();

-- Only leads and workspace owners/admins change a project's visibility.
create function private.entities_guard_project_visibility()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'project'
     and (select auth.uid()) is not null
     and (new.visibility, new.project_id) is distinct from (old.visibility, old.project_id)
     and not private.can_manage_project(new.id) then
    raise exception 'only project leads can change who sees a project'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger entities_guard_project_visibility
  before update of visibility, project_id on public.entities
  for each row execute function private.entities_guard_project_visibility();

revoke execute on function
  private.handle_new_project(),
  private.projects_guard_archive(),
  private.entities_guard_project_visibility()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security (default deny)
-- ---------------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.project_members enable row level security;

revoke all on table public.projects, public.project_members from anon;

-- A project is deleted through its entity; only these columns change.
revoke delete, update on table public.projects from authenticated;
grant update (slug, description, status, archived_at)
  on table public.projects to authenticated;

-- A membership never moves; only its role changes.
revoke update on table public.project_members from authenticated;
grant update (role) on table public.project_members to authenticated;

-- projects ------------------------------------------------------------------

create policy "projects: readable per entity visibility"
  on public.projects for select to authenticated
  using ((select private.can_read_entity(id)));

create policy "projects: owners of the entity create the project"
  on public.projects for insert to authenticated
  with check ((select private.can_create_project(id)));

create policy "projects: editors can update"
  on public.projects for update to authenticated
  using ((select private.can_edit_project(id)))
  with check ((select private.can_edit_project(id)));

-- project_members -----------------------------------------------------------

create policy "project_members: readable with the project"
  on public.project_members for select to authenticated
  using ((select private.can_read_entity(project_id)));

create policy "project_members: leads and workspace admins add"
  on public.project_members for insert to authenticated
  with check ((select private.can_manage_project(project_id)));

create policy "project_members: leads and workspace admins change roles"
  on public.project_members for update to authenticated
  using ((select private.can_manage_project(project_id)))
  with check ((select private.can_manage_project(project_id)));

create policy "project_members: leads and workspace admins remove, anyone can leave"
  on public.project_members for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.can_manage_project(project_id))
  );

-- ---------------------------------------------------------------------------
-- RPCs (security invoker: every write goes through RLS as the caller)
-- ---------------------------------------------------------------------------

create function public.create_project(
  workspace uuid,
  name text,
  slug text,
  description text default '',
  status public.project_status default 'planning',
  is_private boolean default false
)
returns public.projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid := gen_random_uuid();
  result public.projects;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- No RETURNING: rows are read back once both exist.
  insert into public.entities (id, workspace_id, type, title, visibility, project_id, owner_id)
  values (
    new_id,
    create_project.workspace,
    'project',
    create_project.name,
    case when create_project.is_private then 'project' else 'workspace' end::public.visibility,
    case when create_project.is_private then new_id end,
    (select auth.uid())
  );

  insert into public.projects (id, workspace_id, slug, description, status)
  values (
    new_id,
    create_project.workspace,
    create_project.slug,
    create_project.description,
    create_project.status
  );

  select p.* into result from public.projects p where p.id = new_id;
  return result;
end;
$$;

create function public.update_project(
  project uuid,
  name text,
  slug text,
  description text,
  status public.project_status,
  is_private boolean
)
returns public.projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.projects;
begin
  update public.entities en
  set
    title = update_project.name,
    visibility = case when update_project.is_private then 'project' else 'workspace' end::public.visibility,
    project_id = case when update_project.is_private then update_project.project end
  where en.id = update_project.project
    and en.type = 'project';
  if not found then
    raise exception 'project not found or not editable' using errcode = '42501';
  end if;

  update public.projects p
  set
    slug = update_project.slug,
    description = update_project.description,
    status = update_project.status
  where p.id = update_project.project;
  if not found then
    raise exception 'project not found or not editable' using errcode = '42501';
  end if;

  select p.* into result from public.projects p where p.id = update_project.project;
  return result;
end;
$$;

revoke execute on function
  public.create_project(uuid, text, text, text, public.project_status, boolean),
  public.update_project(uuid, text, text, text, public.project_status, boolean)
from public, anon;

grant execute on function
  public.create_project(uuid, text, text, text, public.project_status, boolean),
  public.update_project(uuid, text, text, text, public.project_status, boolean)
to authenticated, service_role;
