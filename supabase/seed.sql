-- Local development seed. Runs after migrations on `pnpm db:reset`.
-- NEVER apply to a cloud project. Password for every user: password123
--
-- | User      | Email              | Workspace | Role   |
-- | --------- | ------------------ | --------- | ------ |
-- | Alice (A) | alice@tessera.test | acme      | owner  |
-- | Val (V)   | val@tessera.test   | acme      | viewer |
-- | Bob (B)   | bob@tessera.test   | globex    | owner  |
--
-- IDs are fixed so tests (F04) can reference them.

-- Users (the on_auth_user_created trigger creates their profiles) ------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id,
  'authenticated',
  'authenticated',
  u.email,
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', u.display_name),
  now(),
  now(),
  '', '', '', ''
from (
  values
    ('00000000-0000-4000-a000-00000000000a'::uuid, 'alice@tessera.test', 'Alice'),
    ('00000000-0000-4000-a000-00000000000b'::uuid, 'bob@tessera.test', 'Bob'),
    ('00000000-0000-4000-a000-00000000000c'::uuid, 'val@tessera.test', 'Val')
) as u (id, email, display_name);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(),
  now(),
  now()
from auth.users u
where u.email like '%@tessera.test';

-- Profiles (onboarded) -------------------------------------------------------

update public.profiles p
set
  handle = s.handle,
  discipline = s.discipline::public.discipline,
  onboarded_at = now()
from (
  values
    ('00000000-0000-4000-a000-00000000000a'::uuid, 'alice', 'lead'),
    ('00000000-0000-4000-a000-00000000000b'::uuid, 'bob', 'data_engineer'),
    ('00000000-0000-4000-a000-00000000000c'::uuid, 'val', 'data_analyst')
) as s (id, handle, discipline)
where p.id = s.id;

-- Workspaces (the on_workspace_created trigger adds the creator as owner) ----

insert into public.workspaces (id, slug, name, created_by)
values
  ('00000000-0000-4000-b000-000000000001', 'acme', 'Acme Data', '00000000-0000-4000-a000-00000000000a'),
  ('00000000-0000-4000-b000-000000000002', 'globex', 'Globex Analytics', '00000000-0000-4000-a000-00000000000b');

insert into public.workspace_members (workspace_id, user_id, role)
values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000c', 'viewer');

-- Entities in acme ------------------------------------------------------------

insert into public.entities (id, workspace_id, type, title, visibility, owner_id)
values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
   'page', 'Welcome to Acme', 'workspace', '00000000-0000-4000-a000-00000000000a'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001',
   'page', 'Alice''s private notes', 'private', '00000000-0000-4000-a000-00000000000a');
