create or replace function public.cgf_require_admin_provisioning()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.raw_app_meta_data ->> 'account_provisioning' is distinct from 'administrator' then
    raise exception 'Accounts must be created by a system administrator' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.cgf_require_admin_provisioning() from public, anon, authenticated;
drop trigger if exists cgf_require_admin_provisioning on auth.users;
create trigger cgf_require_admin_provisioning
  before insert on auth.users
  for each row execute function public.cgf_require_admin_provisioning();

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
