create function cgf_private.validate_cgf_settings() returns trigger language plpgsql set search_path='' as $$
begin
 if new.key='committee_operations_members' and new.value not in ('2','3') then raise exception 'Operations committee size must be 2 or 3' using errcode='23514'; end if;
 if new.key='committee_director_threshold_tjs' then
   if new.value !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Director threshold must be a positive TJS amount' using errcode='23514'; end if;
   if new.value::numeric<=0 then raise exception 'Director threshold must be positive' using errcode='23514'; end if;
 end if;
 new.updated_by:=auth.uid(); new.updated_at:=now(); return new;
end $$;
create function cgf_private.audit_system_setting() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_trail(table_name,record_id,action,changed_by,old_data,new_data) values('system_settings',case when tg_op='DELETE' then old.id else new.id end,tg_op,auth.uid(),case when tg_op<>'INSERT' then to_jsonb(old) else null end,case when tg_op<>'DELETE' then to_jsonb(new) else null end);
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger cgf_settings_validation before insert or update on public.system_settings for each row execute function cgf_private.validate_cgf_settings();
create trigger cgf_settings_audit after insert or update or delete on public.system_settings for each row execute function cgf_private.audit_system_setting();
revoke all on function cgf_private.validate_cgf_settings(),cgf_private.audit_system_setting() from public,anon,authenticated;
