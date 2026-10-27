begin;
set local statement_timeout='45s';
set local lock_timeout='5s';

do $test$
declare
  administrator uuid; product_id uuid:=gen_random_uuid(); failed_id uuid:=gen_random_uuid();
  product_code text:='PRODUCTQA_'||replace(product_id::text,'-','');
  reason text:='Product rollback acceptance '||product_id::text;
  fields jsonb; receipt jsonb; revision bigint:=0; identity_row record; allowed boolean;
  audit_count integer; referenced_id uuid; referenced_revision bigint; tested_roles integer:=0;
begin
  select p.id into administrator from public.profiles p join public.roles r on r.id=p.role_id
  where p.is_active and r.is_active and p.bank_id is null and r.code='super_admin' and r.tier=1 limit 1;
  if administrator is null then raise exception 'Existing active Super Administrator fixture required'; end if;
  fields:=jsonb_build_object('code',lower(product_code),'name_en','Product rollback fixture','name_ru',null,'name_tj',null,'guarantee_coverage',65.25,'is_active',true);
  perform set_config('request.jwt.claim.sub',administrator::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;
  receipt:=public.cgf_save_product(product_id,fields,null,reason,false);
  if receipt->>'id'<>product_id::text or receipt#>>'{record,code}'<>product_code or (receipt#>>'{record,administration_revision}')::bigint<>0 then raise exception 'Create receipt mismatch'; end if;
  if not exists(select 1 from public.loan_products where id=product_id and guarantee_coverage=65.25 and upfront_fee_rate is null and quarterly_fee_rate is null) then raise exception 'Authenticated read-back failed'; end if;
  begin perform public.cgf_save_product(product_id,fields,null,reason,false); raise exception 'Stale revision accepted'; exception when serialization_failure then null; end;
  begin perform public.cgf_save_product(failed_id,fields,null,reason,false); raise exception 'Duplicate code accepted'; exception when unique_violation then null; end;
  begin perform public.cgf_save_product(product_id,fields,0,'ab',false); raise exception 'Missing reason accepted'; exception when check_violation then null; end;
  begin perform public.cgf_save_product(product_id,fields||'{"guarantee_coverage":50.001}'::jsonb,0,reason,false); raise exception 'Rounded invalid coverage accepted'; exception when check_violation then null; end;
  begin update public.loan_products set name_en='Forbidden' where id=product_id; raise exception 'Direct write accepted'; exception when insufficient_privilege then null; end;
  reset role;
  if not exists(select 1 from public.audit_trail where table_name='loan_products' and record_id=product_id and changed_by=administrator and action='CREATE_PRODUCT' and old_data is null and new_data->>'reason'=reason) then raise exception 'Attributed create audit missing'; end if;
  for identity_row in select p.id,p.bank_id,r.code,r.tier from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active loop
    allowed:=identity_row.bank_id is null and ((identity_row.code='super_admin' and identity_row.tier=1) or (identity_row.code='prsf_admin' and identity_row.tier=2));
    perform set_config('request.jwt.claim.sub',identity_row.id::text,true);
    set local role authenticated;
    begin
      receipt:=public.cgf_save_product(product_id,fields,revision,reason,false);
      if not allowed then raise exception 'Prohibited product authority: %',identity_row.code; end if;
      revision:=revision+1;
    exception when insufficient_privilege then if allowed then raise exception 'Administrator unexpectedly denied'; end if;
    end;
    reset role;
    tested_roles:=tested_roles+1;
  end loop;
  perform set_config('request.jwt.claim.sub',administrator::text,true);
  select p.id,p.administration_revision into referenced_id,referenced_revision from public.loan_products p where exists(select 1 from public.loan_applications a where a.product_id=p.id) limit 1;
  if referenced_id is not null then
    set local role authenticated;
    begin perform public.cgf_save_product(referenced_id,'{}',referenced_revision,reason,true); raise exception 'Referenced product deleted'; exception when foreign_key_violation then null; end;
    reset role;
  end if;
  execute 'alter table public.audit_trail add constraint cgf_product_acceptance_audit check ((new_data->>''reason'') is distinct from '||quote_literal(reason||' audit-failure')||') not valid';
  select count(*) into audit_count from public.audit_trail where table_name='loan_products' and record_id=product_id;
  set local role authenticated;
  begin perform public.cgf_save_product(failed_id,fields||jsonb_build_object('code',product_code||'F'),null,reason||' audit-failure',false); raise exception 'Create audit failure accepted'; exception when check_violation then null; end;
  begin perform public.cgf_save_product(product_id,fields||'{"name_en":"Must roll back"}'::jsonb,revision,reason||' audit-failure',false); raise exception 'Update audit failure accepted'; exception when check_violation then null; end;
  begin perform public.cgf_save_product(product_id,'{}',revision,reason||' audit-failure',true); raise exception 'Delete audit failure accepted'; exception when check_violation then null; end;
  reset role;
  if exists(select 1 from public.loan_products where id=failed_id) or not exists(select 1 from public.loan_products where id=product_id and administration_revision=revision and name_en='Product rollback fixture') or (select count(*) from public.audit_trail where table_name='loan_products' and record_id=product_id)<>audit_count then raise exception 'Audit failure did not roll back'; end if;
  alter table public.audit_trail drop constraint cgf_product_acceptance_audit;
  set local role authenticated;
  receipt:=public.cgf_save_product(product_id,fields||'{"is_active":false}'::jsonb,revision,reason,false);
  revision:=revision+1;
  if receipt#>>'{record,is_active}'<>'false' then raise exception 'Deactivation failed'; end if;
  receipt:=public.cgf_save_product(product_id,'{}',revision,reason,true);
  if receipt->>'deleted'<>'true' then raise exception 'Delete receipt mismatch'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.cgf_save_product(failed_id,fields,null,reason,false); raise exception 'Missing identity accepted'; exception when insufficient_privilege then null; end;
  reset role;
  set local role anon;
  begin perform public.cgf_save_product(failed_id,fields,null,reason,false); raise exception 'Anonymous execution accepted'; exception when insufficient_privilege then null; end;
  reset role;
  if has_table_privilege('authenticated','public.loan_products','UPDATE') or has_table_privilege('anon','public.loan_products','SELECT') then raise exception 'Unsafe direct grants'; end if;
  if not exists(select 1 from public.audit_trail where table_name='loan_products' and record_id=product_id and action='DELETE_PRODUCT' and old_data->>'id'=product_id::text and new_data->'record'='null'::jsonb) then raise exception 'Deletion audit lost history'; end if;
  raise notice 'Product live rollback acceptance passed across % existing active identities; referenced delete checked: %',tested_roles,referenced_id is not null;
end $test$;
rollback;
