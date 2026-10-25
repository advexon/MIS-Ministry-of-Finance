begin;
set local statement_timeout='20s';
select set_config('request.test.admin',(select p.id::text from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and p.bank_id is null and r.is_active and r.code='super_admin' and r.tier=1 limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('request.test.admin'),true);
set local role authenticated;
do $$
declare target uuid; revision bigint; grants jsonb; receipt jsonb; resource_name text;
begin
  select id,permission_revision into target,revision from public.roles where code='prsf_analyst';
  if target is null or nullif(current_setting('request.jwt.claim.sub'),'') is null then raise exception 'Acceptance identities unavailable';end if;
  select jsonb_agg(jsonb_build_object('resource',resource,'can_view',false,'can_create',false,'can_update',false,'can_delete',false,'can_approve',false)) into grants
  from unnest(array['users','roles','loans','claims','fees','banks','reports','audit_logs','access_logs']) resource;
  receipt:=public.cgf_save_role_permissions(target,grants,revision,'Rollback-only permission acceptance');
  if receipt->>'role_id'<>target::text or (receipt->>'revision')::bigint<>revision+1 then raise exception 'Incorrect receipt';end if;
  if (select permission_revision from public.roles where id=target)<>revision+1 then raise exception 'Revision not persisted';end if;
  begin perform public.cgf_save_role_permissions(target,grants,revision,'Rollback stale edit');raise exception 'Stale write accepted';exception when serialization_failure then null;end;
  begin perform public.cgf_save_role_permissions(target,grants,revision+1,'');raise exception 'Missing reason accepted';exception when check_violation then null;end;
  begin update public.role_permissions set can_view=true where role_id=target;raise exception 'Direct permission write accepted';exception when insufficient_privilege then null;end;
  begin update public.roles set permission_revision=0 where id=target;raise exception 'Direct revision write accepted';exception when insufficient_privilege then null;end;
  foreach resource_name in array array['roles','role_permissions'] loop
    if has_table_privilege('authenticated','public.'||resource_name,'INSERT') or has_table_privilege('authenticated','public.'||resource_name,'UPDATE') or has_table_privilege('authenticated','public.'||resource_name,'DELETE') or has_table_privilege('authenticated','public.'||resource_name,'TRUNCATE') then raise exception 'Direct grants remain';end if;
  end loop;
  if has_function_privilege('anon','public.cgf_save_role_permissions(uuid,jsonb,bigint,text)','EXECUTE') then raise exception 'Anonymous execution remains';end if;
end $$;
reset role;
do $$
declare member record; target uuid; revision bigint; grants jsonb; events integer;
begin
  select id,permission_revision into target,revision from public.roles where code='prsf_analyst';
  select count(*) into events from public.audit_trail where record_id=target and action='UPDATE_PERMISSIONS' and changed_by=current_setting('request.test.admin')::uuid and new_data->>'reason'='Rollback-only permission acceptance' and (new_data->>'revision')::bigint=revision and jsonb_array_length(new_data->'permissions')>=9 and (old_data->>'revision')::bigint=revision-1;
  if events<>1 then raise exception 'Attributed before/after audit missing';end if;
  select jsonb_agg(jsonb_build_object('resource',resource,'can_view',false,'can_create',false,'can_update',false,'can_delete',false,'can_approve',false)) into grants from unnest(array['users','roles','loans','claims','fees','banks','reports','audit_logs','access_logs']) resource;
  for member in select distinct on(r.code) p.id,r.code,p.bank_id from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active order by r.code,p.id loop
    perform set_config('request.jwt.claim.sub',member.id::text,true);
    if member.code in ('super_admin','prsf_admin') and member.bank_id is null then
      perform public.cgf_save_role_permissions(target,grants,revision,'Rollback role authority acceptance');revision:=revision+1;
    else
      begin perform public.cgf_save_role_permissions(target,grants,revision,'Rollback role denial acceptance');raise exception 'Non-administrator accepted';exception when insufficient_privilege then null;end;
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.cgf_save_role_permissions(target,grants,revision,'Rollback missing identity');raise exception 'Missing identity accepted';exception when insufficient_privilege then null;end;
end $$;
rollback;
