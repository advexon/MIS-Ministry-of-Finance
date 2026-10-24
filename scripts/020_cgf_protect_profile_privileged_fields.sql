begin;

create or replace function public.cgf_guard_profile_privileges()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      raise exception using errcode = '42501', message = 'Profiles must be provisioned by the authorized user-management service';
    end if;
    if (to_jsonb(new) - array['first_name','last_name','phone','preferred_language','updated_at'])
       is distinct from (to_jsonb(old) - array['first_name','last_name','phone','preferred_language','updated_at']) then
      raise exception using errcode = '42501', message = 'Privileged profile fields require the authorized user-management service';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.cgf_guard_profile_privileges() from public, anon, authenticated;
drop trigger if exists cgf_guard_profile_privileges on public.profiles;
create trigger cgf_guard_profile_privileges before insert or update on public.profiles for each row execute function public.cgf_guard_profile_privileges();

commit;
