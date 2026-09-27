-- F07 — workspaces, membership & invites.
--
-- * `workspaces`: slugs that collide with static routes under `/w` are reserved.
-- * `workspace_members`: only `role` can change; a constraint trigger rejects
--   any update or delete that leaves a workspace without an owner (deleting
--   the workspace itself still cascades).
-- * Token invites: the app stores `sha256(token)` in `invites.token_hash` and
--   sends `/invite/<token>`. RPC `invite_preview(token)` describes the invite
--   to the signed-in user; `accept_invite(token)` verifies the hash and reuses
--   `private.accept_invite_row` (email, expiry, not accepted).
--
-- Security-definer code lives in `private`; the `public` RPCs are thin
-- `security invoker` wrappers so no definer function is exposed via the API.

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------

alter table public.workspaces
  add constraint workspaces_slug_not_reserved check (slug::text not in ('new'));

-- ---------------------------------------------------------------------------
-- workspace_members
-- ---------------------------------------------------------------------------

-- A membership never moves between users or workspaces; only its role changes.
revoke update on table public.workspace_members from authenticated;
grant update (role) on table public.workspace_members to authenticated;

-- Rejects a change that leaves the workspace with zero owners. Security
-- definer: after "leave", the caller can no longer see the other members.
create function private.workspace_members_keep_an_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'owner' then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and new.role = 'owner'
     and new.workspace_id = old.workspace_id then
    return null;
  end if;

  -- Serializes concurrent ownership changes in the workspace. Not found when
  -- the workspace itself is being deleted (members cascade): allow it.
  perform 1
  from public.workspaces w
  where w.id = old.workspace_id
  for no key update;
  if not found then
    return null;
  end if;

  if not exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = old.workspace_id
      and m.role = 'owner'
  ) then
    raise exception 'a workspace must keep at least one owner'
      using errcode = 'check_violation',
            hint = 'Make another member an owner first.';
  end if;
  return null;
end;
$$;

create constraint trigger workspace_members_keep_an_owner
  after update or delete on public.workspace_members
  for each row execute function private.workspace_members_keep_an_owner();

revoke execute on function private.workspace_members_keep_an_owner()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Token invites
-- ---------------------------------------------------------------------------

-- Hex sha256 of the raw token; matches `hashInviteToken` in the app.
create function private.hash_invite_token(token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(token, 'UTF8')), 'hex');
$$;

-- What the signed-in holder of `token` may know about its invite.
create function private.invite_preview(token text)
returns table (
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  role public.workspace_role,
  invited_by_name text,
  expires_at timestamptz,
  status text,
  email_matches boolean,
  is_member boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    w.id,
    w.name,
    w.slug::text,
    i.role,
    p.display_name,
    i.expires_at,
    case
      when i.accepted_at is not null then 'accepted'
      when i.expires_at <= now() then 'expired'
      else 'pending'
    end,
    lower(i.email::text) = lower((select private.current_user_email())::text),
    exists (
      select 1
      from public.workspace_members m
      where m.workspace_id = i.workspace_id
        and m.user_id = (select auth.uid())
    )
  from public.invites i
  join public.workspaces w on w.id = i.workspace_id
  left join public.profiles p on p.id = i.invited_by
  where i.token_hash = private.hash_invite_token(invite_preview.token)
    and (select auth.uid()) is not null;
$$;

-- Accepts the invite whose hash matches `token`; returns the workspace id.
create function private.accept_invite(token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_id uuid;
begin
  select i.id into found_id
  from public.invites i
  where i.token_hash = private.hash_invite_token(accept_invite.token);

  if found_id is null then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  return private.accept_invite_row(found_id);
end;
$$;

revoke execute on function
  private.hash_invite_token(text),
  private.invite_preview(text),
  private.accept_invite(text)
from public, anon;

grant execute on function
  private.invite_preview(text),
  private.accept_invite(text)
to authenticated, service_role;

create function public.invite_preview(token text)
returns table (
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  role public.workspace_role,
  invited_by_name text,
  expires_at timestamptz,
  status text,
  email_matches boolean,
  is_member boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.invite_preview(invite_preview.token);
$$;

create function public.accept_invite(token text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.accept_invite(accept_invite.token);
$$;

revoke execute on function
  public.invite_preview(text),
  public.accept_invite(text)
from public, anon;

grant execute on function
  public.invite_preview(text),
  public.accept_invite(text)
to authenticated, service_role;
