-- F06 fix — match invite emails case-insensitively.
--
-- `invites.email` is citext, but with `search_path = ''` the citext `=`
-- operator (schema `extensions`) is not resolved, so comparisons fell back to
-- case-sensitive text equality: an invite to `Ada@Example.com` never matched
-- the user `ada@example.com`. Compare lowercased text explicitly instead.

create or replace function private.my_pending_invites()
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
  where lower(i.email::text) = lower((select private.current_user_email())::text)
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

create or replace function private.accept_invite_row(invite_id uuid)
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
     or lower(inv.email::text)
        is distinct from lower((select private.current_user_email())::text) then
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
