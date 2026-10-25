begin;
create function public.cgf_directory_acceptance_audit_failure() returns trigger language plpgsql set search_path='' as $$
begin
  if new.new_data->>'reason'='Directory acceptance forced audit failure' then raise exception 'Forced directory acceptance audit failure';end if;
  return new;
end $$;
create trigger cgf_directory_acceptance_audit_failure before insert on public.audit_trail for each row execute function public.cgf_directory_acceptance_audit_failure();
do $$
declare
  administrator uuid; member record; bank_one uuid:=gen_random_uuid(); bank_two uuid:=gen_random_uuid(); branch_one uuid:=gen_random_uuid();
  code_one text:='DIRQA_'||substr(replace(gen_random_uuid()::text,'-',''),1,20);
  code_two text:='DIRQA_'||substr(replace(gen_random_uuid()::text,'-',''),1,20);
  payload jsonb; branch_payload jsonb; receipt jsonb; current_revision bigint:=0; audit_count integer;
begin
  select p.id into administrator from public.profiles p join public.roles r on r.id=p.role_id
  where p.is_active and p.bank_id is null and r.is_active and r.code='super_admin' and r.tier=1 order by p.id limit 1;
  if administrator is null then raise exception 'Active Super Administrator fixture required';end if;
  payload:=jsonb_build_object('code',code_one,'name_en','Directory acceptance bank','name_ru',null,'name_tj',null,'is_active',true);
  branch_payload:=payload||jsonb_build_object('code','HQ','city','Dushanbe','district','Fixture');
  perform set_config('request.jwt.claim.sub',administrator::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;
  receipt:=public.cgf_save_bank_directory('banks',bank_one,null,payload,null,'Directory acceptance create',false);
  if receipt->>'id'<>bank_one::text or receipt#>>'{record,administration_revision}'<>'0' then raise exception 'Create receipt failed';end if;
  if not exists(select 1 from public.banks where id=bank_one and code=upper(code_one)) then raise exception 'Authenticated RLS read-back failed';end if;
  begin
    perform public.cgf_save_bank_directory('banks',bank_one,null,payload,0,'',false);
    raise exception 'Missing reason accepted';
  exception when check_violation then null;end;
  receipt:=public.cgf_save_bank_directory('banks',bank_one,null,payload||'{"is_active":false}',0,'Directory acceptance update',false);
  current_revision:=1;
  if receipt#>>'{record,administration_revision}'<>'1' then raise exception 'Revision increment failed';end if;
  begin
    perform public.cgf_save_bank_directory('banks',bank_one,null,payload,0,'Directory acceptance stale',false);
    raise exception 'Stale write accepted';
  exception when serialization_failure then null;end;
  begin
    update public.banks set code='BYPASS' where id=bank_one;
    raise exception 'Direct bank write accepted';
  exception when insufficient_privilege then null;end;
  perform public.cgf_save_bank_directory('banks',bank_two,null,payload||jsonb_build_object('code',code_two),null,'Directory acceptance second bank',false);
  perform public.cgf_save_bank_directory('bank_branches',branch_one,bank_one,branch_payload,null,'Directory acceptance branch',false);
  if not exists(select 1 from public.bank_branches where id=branch_one and bank_id=bank_one) then raise exception 'Branch RLS read-back failed';end if;
  begin
    perform public.cgf_save_bank_directory('banks',bank_one,null,'{}',1,'Directory acceptance linked deletion',true);
    raise exception 'Bank with branches deleted';
  exception when foreign_key_violation then null;end;
  begin
    perform public.cgf_save_bank_directory('bank_branches',branch_one,bank_two,branch_payload,0,'Directory acceptance branch move',false);
    raise exception 'Branch moved';
  exception when check_violation then null;end;
  begin
    perform public.cgf_save_bank_directory('banks',bank_one,null,payload,1,'Directory acceptance forced audit failure',false);
    raise exception 'Audit failure accepted';
  exception when raise_exception then
    if sqlerrm<>'Forced directory acceptance audit failure' then raise;end if;
  end;
  if not exists(select 1 from public.banks where id=bank_one and administration_revision=1 and is_active=false) then raise exception 'Failed audit did not roll back bank';end if;
  reset role;
  if not exists(select 1 from public.audit_trail where table_name='banks' and record_id=bank_one and changed_by=administrator and action='UPDATE_DIRECTORY' and old_data->>'is_active'='true' and new_data#>>'{record,is_active}'='false' and new_data->>'reason'='Directory acceptance update') then raise exception 'Attributable before/after audit missing';end if;
  for member in select p.id,r.code,r.tier,p.bank_id from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and p.id<>administrator loop
    perform set_config('request.jwt.claim.sub',member.id::text,true);
    set local role authenticated;
    if member.bank_id is null and ((member.code='super_admin' and member.tier=1) or (member.code='prsf_admin' and member.tier=2)) then
      perform public.cgf_save_bank_directory('banks',bank_one,null,payload,current_revision,'Directory acceptance administrator',false);
      current_revision:=current_revision+1;
    else
      begin
        perform public.cgf_save_bank_directory('banks',bank_one,null,payload,current_revision,'Directory acceptance prohibited role',false);
        raise exception 'Non-administrator directory mutation accepted';
      exception when insufficient_privilege then null;end;
    end if;
    reset role;
  end loop;
  perform set_config('request.jwt.claim.sub','',true);
  set local role authenticated;
  begin
    perform public.cgf_save_bank_directory('banks',bank_one,null,payload,current_revision,'Directory acceptance missing identity',false);
    raise exception 'Missing identity accepted';
  exception when insufficient_privilege then null;end;
  reset role;
  perform set_config('request.jwt.claim.sub',administrator::text,true);
  set local role authenticated;
  perform public.cgf_save_bank_directory('bank_branches',branch_one,bank_one,'{}',0,'Directory acceptance branch delete',true);
  perform public.cgf_save_bank_directory('banks',bank_one,null,'{}',current_revision,'Directory acceptance bank delete',true);
  reset role;
  if exists(select 1 from public.bank_branches where id=branch_one) or exists(select 1 from public.banks where id=bank_one) then raise exception 'Unused record deletion failed';end if;
  if not exists(select 1 from public.audit_trail where record_id=bank_one and action='DELETE_DIRECTORY' and old_data->>'id'=bank_one::text) then raise exception 'Deletion audit was lost';end if;
  select count(*) into audit_count from public.audit_trail where record_id in (bank_one,bank_two,branch_one);
  if audit_count<6 then raise exception 'Expected directory audits missing';end if;
end $$;
rollback;
