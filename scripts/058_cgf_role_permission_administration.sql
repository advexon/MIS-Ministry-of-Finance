begin;
alter table public.roles add column permission_revision bigint not null default 0 check (permission_revision >= 0);

create function public.cgf_save_role_permissions(p_role_id uuid,p_permissions jsonb,p_expected_revision bigint,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_tier integer; target public.roles%rowtype; before_rows jsonb; after_rows jsonb; item jsonb; resource_name text;
allowed_resources constant text[]:=array['users','roles','loans','claims','fees','banks','reports','audit_logs','access_logs'];
begin
  select r.tier into actor_tier from public.profiles p join public.roles r on r.id=p.role_id
  where p.id=actor and p.is_active and p.bank_id is null and r.is_active
    and ((r.code='super_admin' and r.tier=1) or (r.code='prsf_admin' and r.tier=2));
  if actor_tier is null then raise exception 'Active Fund administrator required' using errcode='42501';end if;
  if length(btrim(coalesce(p_reason,''))) not between 3 and 2000 then raise exception 'A change reason of 3 to 2000 characters is required' using errcode='23514';end if;
  select * into target from public.roles where id=p_role_id for update;
  if not found or target.tier<actor_tier or target.code='super_admin' then raise exception 'This role cannot be edited by this administrator' using errcode='42501';end if;
  if p_expected_revision is distinct from target.permission_revision then raise exception 'Permissions changed; reload the role before saving' using errcode='40001';end if;
  if jsonb_typeof(p_permissions) is distinct from 'array' then raise exception 'Permission array required' using errcode='23514';end if;
  if jsonb_array_length(p_permissions)<>cardinality(allowed_resources) then raise exception 'Complete registered permission set required' using errcode='23514';end if;
  if (select count(distinct e->>'resource') from jsonb_array_elements(p_permissions)e)<>cardinality(allowed_resources) then raise exception 'Duplicate or missing resources' using errcode='23514';end if;
  for item in select value from jsonb_array_elements(p_permissions) loop
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid permission record' using errcode='23514';end if;
    resource_name:=item->>'resource';
    if resource_name is null or not(resource_name=any(allowed_resources))
      or (select count(*) from jsonb_object_keys(item))<>6
      or exists(select 1 from unnest(array['can_view','can_create','can_update','can_delete','can_approve']) k where jsonb_typeof(item->k) is distinct from 'boolean') then
      raise exception 'Unknown resource or invalid permission flags' using errcode='23514';end if;
    if (target.code='auditor' and (item->>'can_create'='true' or item->>'can_update'='true' or item->>'can_delete'='true' or item->>'can_approve'='true'))
      or (target.code='legal_officer' and ((resource_name not in ('loans','claims') and item->>'can_view'='true') or item->>'can_create'='true' or item->>'can_update'='true' or item->>'can_delete'='true' or item->>'can_approve'='true'))
      or (target.code='prsf_admin' and resource_name in ('loans','claims') and (item->>'can_create'='true' or item->>'can_delete'='true' or item->>'can_approve'='true')) then
      raise exception 'Built-in business restrictions cannot be overridden by grants' using errcode='23514';end if;
  end loop;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.resource),'[]'::jsonb) into before_rows from public.role_permissions r where role_id=p_role_id;
  insert into public.role_permissions(role_id,resource,can_view,can_create,can_update,can_delete,can_approve)
  select p_role_id,e->>'resource',(e->>'can_view')::boolean,(e->>'can_create')::boolean,(e->>'can_update')::boolean,(e->>'can_delete')::boolean,(e->>'can_approve')::boolean
  from jsonb_array_elements(p_permissions)e
  on conflict(role_id,resource) do update set can_view=excluded.can_view,can_create=excluded.can_create,can_update=excluded.can_update,can_delete=excluded.can_delete,can_approve=excluded.can_approve,updated_at=now();
  update public.roles set permission_revision=permission_revision+1 where id=p_role_id;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.resource),'[]'::jsonb) into after_rows from public.role_permissions r where role_id=p_role_id;
  insert into public.audit_trail(table_name,record_id,action,changed_by,old_data,new_data)
  values('roles',p_role_id,'UPDATE_PERMISSIONS',actor,jsonb_build_object('revision',target.permission_revision,'permissions',before_rows),jsonb_build_object('revision',target.permission_revision+1,'permissions',after_rows,'reason',btrim(p_reason)));
  return jsonb_build_object('role_id',p_role_id,'revision',target.permission_revision+1);
end $$;
revoke all on function public.cgf_save_role_permissions(uuid,jsonb,bigint,text) from public,anon;
grant execute on function public.cgf_save_role_permissions(uuid,jsonb,bigint,text) to authenticated;
revoke insert,update,delete,truncate on public.role_permissions from public,anon,authenticated;
revoke insert,update,delete,truncate on public.roles from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
