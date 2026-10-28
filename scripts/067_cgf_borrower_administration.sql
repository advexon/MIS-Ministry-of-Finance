alter table public.borrowers add column administration_revision bigint not null default 0 check (administration_revision >= 0);

create function public.cgf_borrower_directory_guard() returns trigger language plpgsql set search_path = '' as $function$
begin
  if new.id is distinct from old.id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'Borrower provenance is immutable' using errcode='23514';
  end if;
  if exists(select 1 from public.loan_applications where borrower_id=old.id) and
    (new.name is distinct from old.name or new.tin_number is distinct from old.tin_number or new.legal_type is distinct from old.legal_type or new.registration_number is distinct from old.registration_number) then
    raise exception 'Linked borrower identity is immutable; existing applications must retain their identity' using errcode='23514';
  end if;
  new.administration_revision:=old.administration_revision+1;
  return new;
end $function$;
create trigger cgf_borrower_directory_guard before update on public.borrowers for each row execute function public.cgf_borrower_directory_guard();

create function public.cgf_save_borrower(p_id uuid,p_values jsonb,p_expected_revision bigint,p_reason text,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  actor uuid:=auth.uid(); previous public.borrowers%rowtype; saved public.borrowers%rowtype;
  field text; value text; max_length integer; normalized jsonb:='{}'::jsonb; old_changes jsonb; new_changes jsonb;
  old_tin text; new_tin text; sector uuid; birthdate date; workforce integer;
  fields text[]:=array['customer_code','legal_type','name','tin_number','registration_number','sector_id','address_street','address_city','address_district','phone','email','legal_rep_surname','legal_rep_name','legal_rep_patronymic','legal_rep_gender','legal_rep_birthdate','legal_rep_country_of_birth','legal_rep_tin','workforce_count'];
begin
  perform 1 from public.profiles p join public.roles r on r.id=p.role_id
    where p.id=actor and p.is_active and p.bank_id is null and r.is_active
      and ((r.code='super_admin' and r.tier=1) or (r.code='prsf_admin' and r.tier=2)) for share of p,r;
  if not found then raise exception 'Active Fund administrator required' using errcode='42501'; end if;
  if p_id is null or p_delete is null or length(btrim(coalesce(p_reason,''))) not between 3 and 2000 then
    raise exception 'Borrower ID, action and a reason of 3 to 2000 characters required' using errcode='23514'; end if;
  if jsonb_typeof(p_values) is distinct from 'object' or octet_length(p_values::text)>20000 then
    raise exception 'Borrower fields must be an object' using errcode='23514'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cgf_borrower_administration',0));
  select tin_number into old_tin from public.borrowers where id=p_id;
  -- Match intake's TIN lock before taking a row lock, so linking a borrower cannot race an identity correction or deletion.
  if old_tin is not null then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('borrower-tin:'||old_tin,0)); end if;
  new_tin:=nullif(btrim(p_values->>'tin_number'),'');
  if not p_delete and new_tin is not null and new_tin is distinct from old_tin then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('borrower-tin:'||new_tin,0)); end if;
  select * into previous from public.borrowers where id=p_id for update;
  if not found or p_expected_revision is distinct from previous.administration_revision then
    raise exception 'Borrower changed or no longer exists; reload before saving' using errcode='40001'; end if;
  if p_delete then
    if p_values<>'{}'::jsonb then raise exception 'Deletion cannot include field changes' using errcode='23514'; end if;
    if exists(select 1 from public.loan_applications where borrower_id=p_id) then raise exception 'Borrower has applications and cannot be deleted' using errcode='23503'; end if;
    delete from public.borrowers where id=p_id;
    old_changes:=jsonb_build_object('id',previous.id,'name',previous.name,'tin_number',previous.tin_number,'legal_type',previous.legal_type,'administration_revision',previous.administration_revision);
  else
    if (select count(*) from jsonb_object_keys(p_values))<>cardinality(fields)
      or exists(select 1 from jsonb_object_keys(p_values) k where not(k=any(fields))) then
      raise exception 'Unknown or missing borrower fields' using errcode='23514'; end if;
    foreach field in array fields loop
      if field='workforce_count' then
        if jsonb_typeof(p_values->field) is distinct from 'null' and jsonb_typeof(p_values->field) is distinct from 'number' then raise exception 'Invalid workforce' using errcode='23514'; end if;
        if p_values->>field is not null and ((p_values->>field)::numeric not between 0 and 2147483647 or (p_values->>field)::numeric<>trunc((p_values->>field)::numeric)) then raise exception 'Invalid workforce' using errcode='23514'; end if;
        workforce:=(p_values->>field)::integer; normalized:=normalized||jsonb_build_object(field,workforce);
      else
        if jsonb_typeof(p_values->field) is distinct from 'string' and jsonb_typeof(p_values->field) is distinct from 'null' then raise exception 'Malformed borrower field' using errcode='23514'; end if;
        value:=nullif(btrim(p_values->>field),'');
        max_length:=case when field in ('name','address_street','email') then 255 when field in ('registration_number','address_city','address_district','legal_rep_surname','legal_rep_name','legal_rep_patronymic','legal_rep_country_of_birth') then 100 when field='legal_rep_gender' then 10 when field='sector_id' then 36 when field='legal_rep_birthdate' then 10 else 50 end;
        if length(value)>max_length then raise exception 'Borrower field is too long' using errcode='23514'; end if;
        normalized:=normalized||jsonb_build_object(field,value);
      end if;
    end loop;
    if normalized->>'name' is null or coalesce(normalized->>'legal_type','') not in ('individual','sole_proprietor','llc','jsc','cooperative','other') then raise exception 'Borrower name and valid legal type required' using errcode='23514'; end if;
    foreach field in array array['tin_number','legal_rep_tin'] loop
      if normalized->>field is not null and normalized->>field !~ '^[0-9]{9}$' and normalized->>field is distinct from to_jsonb(previous)->>field then raise exception 'TIN must contain nine digits' using errcode='23514'; end if;
    end loop;
    if normalized->>'email' is not null and normalized->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and normalized->>'email' is distinct from previous.email then raise exception 'Invalid email' using errcode='23514'; end if;
    if normalized->>'legal_rep_gender' is not null and normalized->>'legal_rep_gender' not in ('male','female') and normalized->>'legal_rep_gender' is distinct from previous.legal_rep_gender then raise exception 'Invalid representative gender' using errcode='23514'; end if;
    if normalized->>'legal_rep_birthdate' is not null then
      if normalized->>'legal_rep_birthdate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid birth date' using errcode='23514'; end if;
      birthdate:=(normalized->>'legal_rep_birthdate')::date;
      if (birthdate>current_date or birthdate<date '1900-01-01') and birthdate is distinct from previous.legal_rep_birthdate then raise exception 'Invalid birth date' using errcode='23514'; end if;
    end if;
    sector:=(normalized->>'sector_id')::uuid;
    if sector is not null and (not exists(select 1 from public.sectors where id=sector) or (sector is distinct from previous.sector_id and not exists(select 1 from public.sectors where id=sector and is_active and not is_prohibited))) then raise exception 'Choose an active eligible sector' using errcode='23514'; end if;
    if new_tin is not null and new_tin is distinct from previous.tin_number and exists(select 1 from public.borrowers where btrim(tin_number)=new_tin and id<>p_id) then raise exception 'Borrower TIN already exists' using errcode='23505'; end if;
    update public.borrowers set customer_code=normalized->>'customer_code',legal_type=normalized->>'legal_type',name=normalized->>'name',tin_number=normalized->>'tin_number',registration_number=normalized->>'registration_number',sector_id=sector,
      address_street=normalized->>'address_street',address_city=normalized->>'address_city',address_district=normalized->>'address_district',phone=normalized->>'phone',email=normalized->>'email',legal_rep_surname=normalized->>'legal_rep_surname',legal_rep_name=normalized->>'legal_rep_name',legal_rep_patronymic=normalized->>'legal_rep_patronymic',legal_rep_gender=normalized->>'legal_rep_gender',legal_rep_birthdate=birthdate,legal_rep_country_of_birth=normalized->>'legal_rep_country_of_birth',legal_rep_tin=normalized->>'legal_rep_tin',workforce_count=workforce where id=p_id returning * into saved;
    select coalesce(jsonb_object_agg(k,to_jsonb(previous)->k),'{}'::jsonb),coalesce(jsonb_object_agg(k,to_jsonb(saved)->k),'{}'::jsonb) into old_changes,new_changes
      from unnest(fields) k where to_jsonb(previous)->k is distinct from to_jsonb(saved)->k;
  end if;
  insert into public.audit_trail(table_name,record_id,action,changed_by,old_data,new_data)
    values('borrowers',p_id,case when p_delete then 'DELETE_BORROWER' else 'UPDATE_BORROWER' end,actor,old_changes,
      jsonb_build_object('changes',new_changes,'reason',btrim(p_reason),'previous_revision',previous.administration_revision,'revision',case when not p_delete then saved.administration_revision end));
  return jsonb_build_object('id',p_id,'deleted',p_delete,'record',case when not p_delete then to_jsonb(saved) end);
end $function$;

revoke insert,update,delete,truncate,references,trigger on public.borrowers from public,anon,authenticated;
revoke select on public.borrowers from public,anon;
grant select on public.borrowers to authenticated;
revoke all on function public.cgf_borrower_directory_guard() from public,anon,authenticated;
revoke all on function public.cgf_save_borrower(uuid,jsonb,bigint,text,boolean) from public,anon;
grant execute on function public.cgf_save_borrower(uuid,jsonb,bigint,text,boolean) to authenticated;
notify pgrst,'reload schema';
