-- F06 — onboarding & user profile.
--
-- * `profiles`: onboarding can only complete once display name, handle and
--   discipline are set; `onboarded_at` is stamped by the server clock and can
--   never be cleared; `avatar_path` must live in the owner's storage folder;
--   size limits on skills and links.
-- * RPC `is_handle_available(handle)`: lets a user check a handle without
--   being able to read other people's profiles.
-- * RPCs `my_pending_invites()` / `accept_pending_invite(invite_id)`: a new
--   user joins a workspace through a pending invite for their own email.
-- * Storage bucket `avatars` (private, ≤ 2 MB, raster images only): the owner
--   writes `<user_id>/…`; the owner and workspace peers read.
--
-- Security-definer code lives in `private`; the `public` RPCs are thin
-- `security invoker` wrappers so no definer function is exposed via the API.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table public.profiles
  add constraint profiles_onboarded_requires_identity check (
    onboarded_at is null
    or (
      handle is not null
      and display_name is not null
      and char_length(btrim(display_name)) > 0
      and discipline is not null
    )
  ),
  add constraint profiles_avatar_path_in_own_folder check (
    avatar_path is null or starts_with(avatar_path, id::text || '/')
  ),
  add constraint profiles_skills_limit check (cardinality(skills) <= 20),
  add constraint profiles_links_limit check (jsonb_array_length(links) <= 10);

-- `onboarded_at` is set once, to the server's clock, and never cleared.
create function private.profiles_stamp_onboarded_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.onboarded_at is not null then
    new.onboarded_at := old.onboarded_at;
  elsif new.onboarded_at is not null then
    new.onboarded_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_stamp_onboarded_at
  before update of onboarded_at on public.profiles
  for each row execute function private.profiles_stamp_onboarded_at();

revoke execute on function private.profiles_stamp_onboarded_at()
from public, anon, authenticated;

-- Users may only change their own profile's editable columns.
revoke update on table public.profiles from authenticated;
grant update (
  handle, display_name, discipline, bio, skills, avatar_path, links, onboarded_at
) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Handle availability
-- ---------------------------------------------------------------------------

-- True when `candidate` is well-formed and not taken by another user.
create function private.is_handle_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select candidate ~ '^[a-z0-9_]{3,30}$'
    and not exists (
      select 1
      from public.profiles p
      where p.handle = candidate::extensions.citext
        and p.id <> (select auth.uid())
    );
$$;

revoke execute on function private.is_handle_available(text) from public, anon;
grant execute on function private.is_handle_available(text) to authenticated, service_role;

create function public.is_handle_available(handle text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_handle_available(is_handle_available.handle);
$$;

revoke execute on function public.is_handle_available(text) from public, anon;
grant execute on function public.is_handle_available(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Pending invites for the signed-in user's email
-- ---------------------------------------------------------------------------

create function private.current_user_email()
returns extensions.citext
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::extensions.citext
  from auth.users u
  where u.id = (select auth.uid());
$$;

create function private.my_pending_invites()
returns table (
  id uuid,
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  role public.workspace_role,
  invited_by_name text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    w.id,
    w.name,
    w.slug::text,
    i.role,
    p.display_name,
    i.expires_at
  from public.invites i
  join public.workspaces w on w.id = i.workspace_id
  left join public.profiles p on p.id = i.invited_by
  where i.email = (select private.current_user_email())
    and i.accepted_at is null
    and i.expires_at > now()
    and not exists (
      select 1
      from public.workspace_members m
      where m.workspace_id = i.workspace_id
        and m.user_id = (select auth.uid())
    )
  order by i.created_at desc;
$$;

-- Accepts one pending invite addressed to the signed-in user's email: adds
-- the membership with the invite's role and marks the invite accepted.
-- F07's token-based `accept_invite` reuses this after verifying the token.
create function private.accept_invite_row(invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.invites;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into inv
  from public.invites i
  where i.id = accept_invite_row.invite_id
  for update;

  if not found
     or inv.email is distinct from (select private.current_user_email()) then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if inv.accepted_at is not null then
    raise exception 'invite already accepted' using errcode = '22023';
  end if;
  if inv.expires_at <= now() then
    raise exception 'invite expired' using errcode = '22023';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, uid, inv.role)
  on conflict (workspace_id, user_id) do nothing;

  update public.invites
  set accepted_at = now()
  where id = inv.id;

  return inv.workspace_id;
end;
$$;

revoke execute on function
  private.current_user_email(),
  private.my_pending_invites(),
  private.accept_invite_row(uuid)
from public, anon;

grant execute on function
  private.current_user_email(),
  private.my_pending_invites(),
  private.accept_invite_row(uuid)
to authenticated, service_role;

create function public.my_pending_invites()
returns table (
  id uuid,
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  role public.workspace_role,
  invited_by_name text,
  expires_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.my_pending_invites();
$$;

-- Returns the joined workspace's id.
create function public.accept_pending_invite(invite_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.accept_invite_row(accept_pending_invite.invite_id);
$$;

revoke execute on function
  public.my_pending_invites(),
  public.accept_pending_invite(uuid)
from public, anon;

grant execute on function
  public.my_pending_invites(),
  public.accept_pending_invite(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage: avatars
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152, -- 2 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- True when `object_name` sits in the folder of the current user or of a
-- user who shares a workspace with them. Non-uuid folders are never readable.
create function private.can_read_avatar(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folder text := (storage.foldername(object_name))[1];
begin
  if folder is null
     or folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return folder = (select auth.uid())::text
    or private.shares_workspace(folder::uuid);
end;
$$;

revoke execute on function private.can_read_avatar(text) from public, anon;
grant execute on function private.can_read_avatar(text) to authenticated, service_role;

create policy "avatars: owner and workspace peers can read"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and private.can_read_avatar(name));

create policy "avatars: owner uploads to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: owner updates own files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: owner deletes own files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
