begin;
alter table public.banks add column administration_revision bigint not null default 0 check (administration_revision >= 0);
alter table public.bank_branches add column administration_revision bigint not null default 0 check (administration_revision >= 0);

create function public.cgf_save_bank_directory(p_resource text,p_id uuid,p_bank_id uuid,p_values jsonb,p_expected_revision bigint,p_reason text,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); before_row jsonb; after_row jsonb; revision bigint; bank_scope uuid;
  code_value text; english_name text; russian_name text; tajik_name text; active_value boolean;
  allowed_keys text[]; change_action text;
begin
  perform 1 from public.profiles p join public.roles r on r.id=p.role_id
  where p.id=actor and p.is_active and p.bank_id is null and r.is_active
    and ((r.code='super_admin' and r.tier=1) or (r.code='prsf_admin' and r.tier=2)) for share of p,r;
  if not found then raise exception 'Active Fund administrator required' using errcode='42501';end if;
  if p_resource is null or p_resource not in ('banks','bank_branches') or p_id is null or p_delete is null then
    raise exception 'Valid directory resource, record ID and action required' using errcode='23514';end if;
  if length(btrim(coalesce(p_reason,''))) not between 3 and 2000 then
    raise exception 'A change reason of 3 to 2000 characters is required' using errcode='23514';end if;
  -- Directory changes are rare; serialize both parent and child mutations before taking row locks.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cgf_bank_directory_administration',0));
  if p_resource='banks' then
    if p_bank_id is not null then raise exception 'Banks cannot have a parent bank' using errcode='23514';end if;
    select to_jsonb(b),b.administration_revision into before_row,revision from public.banks b where b.id=p_id for update;
  else
    if p_bank_id is null then raise exception 'Parent bank required' using errcode='23514';end if;
    perform 1 from public.banks where id=p_bank_id for update;
    if not found then raise exception 'Parent bank not found' using errcode='23514';end if;
    select to_jsonb(b),b.administration_revision,b.bank_id into before_row,revision,bank_scope from public.bank_branches b where b.id=p_id for update;
    if before_row is not null and bank_scope is distinct from p_bank_id then
      raise exception 'Branch cannot be moved to another bank' using errcode='23514';end if;
  end if;
  if before_row is null then
    if p_delete or p_expected_revision is not null then raise exception 'Record no longer exists; reload the directory' using errcode='40001';end if;
  elsif p_expected_revision is distinct from revision then
    raise exception 'Directory record changed; reload before saving' using errcode='40001';
  end if;
  if p_delete then
    if p_values is distinct from '{}'::jsonb then raise exception 'Deletion cannot include field changes' using errcode='23514';end if;
    if p_resource='banks' then
      if exists(select 1 from public.bank_branches where bank_id=p_id) then
        raise exception 'Bank has branches; deactivate it or remove unused branches first' using errcode='23503';end if;
      delete from public.banks where id=p_id;
    else
      if exists(select 1 from public.profiles where branch_id=p_id) then
        raise exception 'Branch has assigned users; deactivate it instead' using errcode='23503';end if;
      delete from public.bank_branches where id=p_id;
    end if;
    change_action:='DELETE_DIRECTORY';
  else
    allowed_keys:=array['code','name_en','name_ru','name_tj','is_active'];
    if p_resource='bank_branches' then allowed_keys:=allowed_keys||array['city','district'];end if;
    if jsonb_typeof(p_values) is distinct from 'object' then raise exception 'Directory fields must be an object' using errcode='23514';end if;
    if (select count(*) from jsonb_object_keys(p_values))<>cardinality(allowed_keys)
      or exists(select 1 from jsonb_object_keys(p_values) k where not(k=any(allowed_keys)))
      or exists(select 1 from unnest(allowed_keys) k where k<>'is_active' and jsonb_typeof(p_values->k) is distinct from 'string' and jsonb_typeof(p_values->k) is distinct from 'null')
      or jsonb_typeof(p_values->'is_active') is distinct from 'boolean' then
      raise exception 'Unknown, missing or malformed directory fields' using errcode='23514';end if;
    code_value:=upper(btrim(p_values->>'code'));english_name:=btrim(p_values->>'name_en');
    russian_name:=nullif(btrim(p_values->>'name_ru'),'');tajik_name:=nullif(btrim(p_values->>'name_tj'),'');
    active_value:=(p_values->>'is_active')::boolean;
    if coalesce(length(code_value),0) not between 1 and 50 or coalesce(length(english_name),0) not between 1 and 255
      or length(russian_name)>255 or length(tajik_name)>255 or length(btrim(p_values->>'city'))>100 or length(btrim(p_values->>'district'))>100 then
      raise exception 'Code and English name required; directory field length exceeded' using errcode='23514';end if;
    if p_resource='banks' then
      if exists(select 1 from public.banks where upper(btrim(code))=code_value and id<>p_id) then
        raise exception 'Bank code already exists' using errcode='23505';end if;
      if before_row is null then
        insert into public.banks(id,code,name_en,name_ru,name_tj,is_active) values(p_id,code_value,english_name,russian_name,tajik_name,active_value) returning to_jsonb(banks) into after_row;
      else
        update public.banks set code=code_value,name_en=english_name,name_ru=russian_name,name_tj=tajik_name,is_active=active_value,administration_revision=revision+1,updated_at=now() where id=p_id returning to_jsonb(banks) into after_row;
      end if;
    else
      if exists(select 1 from public.bank_branches where bank_id=p_bank_id and upper(btrim(code))=code_value and id<>p_id) then
        raise exception 'Branch code already exists for this bank' using errcode='23505';end if;
      if before_row is null then
        insert into public.bank_branches(id,bank_id,code,name_en,name_ru,name_tj,city,district,is_active)
        values(p_id,p_bank_id,code_value,english_name,russian_name,tajik_name,nullif(btrim(p_values->>'city'),''),nullif(btrim(p_values->>'district'),''),active_value) returning to_jsonb(bank_branches) into after_row;
      else
        update public.bank_branches set code=code_value,name_en=english_name,name_ru=russian_name,name_tj=tajik_name,city=nullif(btrim(p_values->>'city'),''),district=nullif(btrim(p_values->>'district'),''),is_active=active_value,administration_revision=revision+1,updated_at=now() where id=p_id returning to_jsonb(bank_branches) into after_row;
      end if;
    end if;
    change_action:=case when before_row is null then 'CREATE_DIRECTORY' else 'UPDATE_DIRECTORY' end;
  end if;
  insert into public.audit_trail(table_name,record_id,action,changed_by,old_data,new_data)
  values(p_resource,p_id,change_action,actor,before_row,jsonb_build_object('record',after_row,'reason',btrim(p_reason),'bank_id',coalesce(p_bank_id,p_id)));
  return jsonb_build_object('id',p_id,'record',after_row,'deleted',p_delete);
end $$;
revoke all on function public.cgf_save_bank_directory(text,uuid,uuid,jsonb,bigint,text,boolean) from public,anon;
grant execute on function public.cgf_save_bank_directory(text,uuid,uuid,jsonb,bigint,text,boolean) to authenticated;
revoke insert,update,delete,truncate on public.banks,public.bank_branches from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
