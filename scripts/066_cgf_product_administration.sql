alter table public.loan_products add column administration_revision bigint not null default 0 check (administration_revision >= 0);

create function public.cgf_save_product(p_id uuid, p_values jsonb, p_expected_revision bigint, p_reason text, p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  actor uuid := auth.uid(); before_row jsonb; after_row jsonb; revision bigint;
  product_code text; english_name text; russian_name text; tajik_name text; coverage numeric;
begin
  perform 1 from public.profiles p join public.roles r on r.id=p.role_id
  where p.id=actor and p.is_active and p.bank_id is null and r.is_active
    and ((r.code='super_admin' and r.tier=1) or (r.code='prsf_admin' and r.tier=2)) for share of p,r;
  if not found then raise exception 'Active Fund administrator required' using errcode='42501'; end if;
  if p_id is null or p_delete is null or length(btrim(coalesce(p_reason,''))) not between 3 and 2000 then
    raise exception 'Product ID, action and a reason of 3 to 2000 characters required' using errcode='23514'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cgf_product_administration',0));
  select to_jsonb(p),p.administration_revision into before_row,revision from public.loan_products p where p.id=p_id for update;
  if before_row is null then
    if p_delete or p_expected_revision is not null then raise exception 'Product no longer exists; reload' using errcode='40001'; end if;
  elsif p_expected_revision is distinct from revision then
    raise exception 'Product changed; reload before saving' using errcode='40001';
  end if;
  if p_delete then
    if p_values is distinct from '{}'::jsonb then raise exception 'Deletion cannot include field changes' using errcode='23514'; end if;
    if exists(select 1 from public.loan_applications where product_id=p_id) then
      raise exception 'Product has applications; deactivate it instead' using errcode='23503'; end if;
    delete from public.loan_products where id=p_id;
  else
    if jsonb_typeof(p_values) is distinct from 'object' then raise exception 'Product fields must be an object' using errcode='23514'; end if;
    if (select count(*) from jsonb_object_keys(p_values))<>6
      or exists(select 1 from jsonb_object_keys(p_values) k where not(k=any(array['code','name_en','name_ru','name_tj','guarantee_coverage','is_active'])))
      or exists(select 1 from unnest(array['code','name_en','name_ru','name_tj']) k where jsonb_typeof(p_values->k) is distinct from 'string' and jsonb_typeof(p_values->k) is distinct from 'null')
      or jsonb_typeof(p_values->'guarantee_coverage') is distinct from 'number'
      or jsonb_typeof(p_values->'is_active') is distinct from 'boolean' then
      raise exception 'Unknown, missing or malformed product fields' using errcode='23514'; end if;
    product_code:=upper(btrim(p_values->>'code')); english_name:=btrim(p_values->>'name_en');
    russian_name:=nullif(btrim(p_values->>'name_ru'),''); tajik_name:=nullif(btrim(p_values->>'name_tj'),'');
    coverage:=(p_values->>'guarantee_coverage')::numeric;
    if coalesce(length(product_code),0) not between 1 and 50 or coalesce(length(english_name),0) not between 1 and 255
      or length(russian_name)>255 or length(tajik_name)>255 or coverage not between 0.01 and 100 or coverage<>round(coverage,2) then
      raise exception 'Valid code, names and coverage of 0.01 to 100 with up to two decimals required' using errcode='23514'; end if;
    if exists(select 1 from public.loan_products where upper(btrim(code))=product_code and id<>p_id) then
      raise exception 'Product code already exists' using errcode='23505'; end if;
    if before_row is null then
      -- Legacy per-product fee columns are intentionally unset: execution uses financial_policy_versions.
      insert into public.loan_products(id,code,name_en,name_ru,name_tj,guarantee_coverage,is_active,upfront_fee_rate,quarterly_fee_rate)
      values(p_id,product_code,english_name,russian_name,tajik_name,coverage,(p_values->>'is_active')::boolean,null,null)
      returning to_jsonb(loan_products) into after_row;
    else
      update public.loan_products set code=product_code,name_en=english_name,name_ru=russian_name,name_tj=tajik_name,
        guarantee_coverage=coverage,is_active=(p_values->>'is_active')::boolean,administration_revision=revision+1,updated_at=now()
      where id=p_id returning to_jsonb(loan_products) into after_row;
    end if;
  end if;
  insert into public.audit_trail(table_name,record_id,action,changed_by,old_data,new_data)
  values('loan_products',p_id,case when p_delete then 'DELETE_PRODUCT' when before_row is null then 'CREATE_PRODUCT' else 'UPDATE_PRODUCT' end,
    actor,before_row,jsonb_build_object('record',after_row,'reason',btrim(p_reason)));
  return jsonb_build_object('id',p_id,'record',after_row,'deleted',p_delete);
end $function$;

revoke insert,update,delete,truncate,references,trigger on public.loan_products from public,anon,authenticated;
revoke select on public.loan_products from public,anon;
grant select on public.loan_products to authenticated;
drop policy if exists loan_products_select on public.loan_products;
create policy loan_products_select on public.loan_products for select to authenticated using (
  exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id=auth.uid() and p.is_active and r.is_active)
);
revoke all on function public.cgf_save_product(uuid,jsonb,bigint,text,boolean) from public,anon;
grant execute on function public.cgf_save_product(uuid,jsonb,bigint,text,boolean) to authenticated;
notify pgrst,'reload schema';
