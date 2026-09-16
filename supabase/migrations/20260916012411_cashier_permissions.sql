alter table public.members
  add column permissions jsonb not null default
  '{"pos":true,"discount":true,"inventory":true,"stringing":true,"expenses":false,"leave":true,"earnings":false}'::jsonb;

alter table public.members
  add constraint members_permissions_object_check
  check (jsonb_typeof(permissions) = 'object');
