begin;
alter table public.loan_applications add column intake_data jsonb not null default '{}'::jsonb check(jsonb_typeof(intake_data)='object'), add column intake_revision bigint not null default 0;

create function public.cgf_save_application(p_id uuid,p_form jsonb,p_expected_revision bigint default null,p_expected_status text default null,p_draft uuid default null,p_reason text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); rc text; actor_bank uuid; b uuid; bank uuid; branch uuid; sector uuid; product uuid; l public.loan_applications%rowtype; previous jsonb; entry record; required_field text; amount numeric; coverage numeric; term integer; grace integer; existing boolean; defaults text[]:=array['clientTin','sectorId','phone','workforce','legalRepSurname','legalRepName','legalRepGender','legalRepTin','branchId','currency','loanTerm','guaranteeCoverage','guaranteeType','applicationDate','purpose'];
begin
 select r.code,p.bank_id into rc,actor_bank from public.profiles p join public.roles r on r.id=p.role_id where p.id=actor and p.is_active and r.is_active;
 if actor is null or (not public.cgf_is_super_admin() and (rc is null or rc not in ('bank_officer','bank_admin'))) then raise exception 'Active originating-bank authority required' using errcode='42501'; end if;
 if p_id is null or jsonb_typeof(p_form) is distinct from 'object' or octet_length(p_form::text)>100000 then raise exception 'Invalid application form' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('application:'||p_id::text,0));
 select * into l from public.loan_applications where id=p_id for update;
 existing:=found;
 bank:=nullif(p_form->>'bankId','')::uuid;
 if bank is null or (not public.cgf_is_super_admin() and bank is distinct from actor_bank) or (existing and bank is distinct from l.bank_id) then raise exception 'Application is outside your bank' using errcode='42501'; end if;
 if existing and l.created_by=actor and l.intake_data=p_form and p_expected_revision is null then return jsonb_build_object('id',l.id,'status',l.status,'revision',l.intake_revision,'replayed',true); end if;
 if existing and (l.status not in ('draft','docs_incomplete') or l.status is distinct from p_expected_status or l.intake_revision is distinct from p_expected_revision) then raise exception 'Application changed or is no longer editable; reload before saving' using errcode='40001'; end if;
 if not existing and (p_expected_revision is not null or p_expected_status is not null) then raise exception 'Application not found' using errcode='42501'; end if;
 if not existing and not public.cgf_is_super_admin() and rc<>'bank_officer' then raise exception 'Only a loan officer may prepare a new application' using errcode='42501'; end if;
 perform cgf_private.require_admin_reason(p_reason);
 if p_reason is not null and length(p_reason)>2000 then raise exception 'Reason is too long' using errcode='22023'; end if;
 for entry in select key,value from jsonb_each(p_form) loop
  if entry.key not in ('legalEntityType','clientName','clientTin','registrationNumber','sectorId','addressStreet','city','district','workforce','establishmentYear','businessDescription','phone','email','bankCustomerCode','isBlacklisted','blacklistReason','guaranteeType','legalRepSurname','legalRepName','legalRepPatronymic','legalRepGender','legalRepBirthdate','legalRepCountry','legalRepTin','passportNumber','bankId','branchId','productId','requestedAmount','currency','loanTerm','gracePeriod','frequency','repaymentMethod','interestRate','guaranteeCoverage','loanOfficer','purpose','purposeDetails','applicationDate','bankApprovalDate','annualTurnover','netIncome','riskRating','totalExposure','collateralDescription','covenantBank','covenantPrsf','guarantors','notes') then raise exception 'Unknown application field: %',entry.key using errcode='22023'; end if;
  if entry.key not in ('isBlacklisted','guarantors') and (jsonb_typeof(entry.value)<>'string' or length(entry.value#>>'{}')>4000) then raise exception 'Invalid field: %',entry.key using errcode='22023'; end if;
 end loop;
 foreach required_field in array array['legalEntityType','clientName','bankId','requestedAmount'] loop
  if nullif(btrim(p_form->>required_field),'') is null then raise exception 'Required field: %',required_field using errcode='22023'; end if;
 end loop;
 for entry in select unnest(array['clientTin','sectorId','addressStreet','city','phone','email','workforce','legalRepSurname','legalRepName','legalRepGender','legalRepBirthdate','legalRepTin','passportNumber','branchId','currency','loanTerm','interestRate','guaranteeCoverage','guaranteeType','applicationDate','purpose','collateralDescription','notes']) as key loop
  if coalesce((select c.is_required from public.column_configurations c where c.entity_type='form:loan_application' and c.column_key=entry.key limit 1),entry.key=any(defaults)) and nullif(btrim(p_form->>entry.key),'') is null then raise exception 'Required field: %',entry.key using errcode='22023'; end if;
 end loop;
 if p_form->>'legalEntityType' not in ('legal_entity','individual_entrepreneur') or coalesce(p_form->>'clientTin','')!~'^[0-9]{9}$' then raise exception 'Choose an entity type and a nine-digit borrower TIN' using errcode='22023'; end if;
 if nullif(p_form->>'legalRepTin','') is not null and (p_form->>'legalRepTin')!~'^[0-9]{9}$' then raise exception 'Representative TIN must contain nine digits' using errcode='22023'; end if;
 if p_form->>'legalEntityType'='individual_entrepreneur' and (p_form->>'legalRepTin' is distinct from p_form->>'clientTin' or p_form->>'clientName' is distinct from concat_ws(' ',nullif(btrim(p_form->>'legalRepSurname'),''),nullif(btrim(p_form->>'legalRepName'),''),nullif(btrim(p_form->>'legalRepPatronymic'),''))) then raise exception 'Entrepreneur and representative identity must match' using errcode='22023'; end if;
 if coalesce(p_form->>'currency','')<>'TJS' then raise exception 'Only TJS applications are supported by the current guarantee workflow' using errcode='22023'; end if;
 if coalesce(p_form->>'frequency','') not in ('monthly','quarterly','semi_annual','annual','bullet') or coalesce(p_form->>'repaymentMethod','') not in ('annuity','declining_balance') or coalesce(p_form->>'guaranteeType','') not in ('individual','blanket') then raise exception 'Invalid repayment or guarantee selection' using errcode='22023'; end if;
 if p_form ? 'isBlacklisted' and jsonb_typeof(p_form->'isBlacklisted')<>'boolean' then raise exception 'Invalid blacklist flag' using errcode='22023'; end if;
 if coalesce((p_form->>'isBlacklisted')::boolean,false) then raise exception 'A blacklisted borrower cannot enter the guarantee workflow' using errcode='23514'; end if;
 for entry in select key,value from jsonb_each_text(p_form) where key in ('requestedAmount','guaranteeCoverage','loanTerm','gracePeriod','interestRate','workforce','establishmentYear','annualTurnover','netIncome','totalExposure') and value<>'' loop
  if entry.value !~ '^-?[0-9]+(\.[0-9]+)?$' or abs(entry.value::numeric)>1e12 then raise exception 'Invalid numeric field: %',entry.key using errcode='22023'; end if;
  if entry.key<>'netIncome' and entry.value::numeric<0 then raise exception 'Negative value: %',entry.key using errcode='22023'; end if;
  if entry.key in ('loanTerm','gracePeriod','workforce','establishmentYear') and entry.value::numeric<>trunc(entry.value::numeric) then raise exception 'Whole number required: %',entry.key using errcode='22023'; end if;
 end loop;
 amount:=(p_form->>'requestedAmount')::numeric; coverage:=nullif(p_form->>'guaranteeCoverage','')::numeric; term:=nullif(p_form->>'loanTerm','')::integer; grace:=coalesce(nullif(p_form->>'gracePeriod','')::integer,0);
 if amount<=0 or amount>50000000 or coverage is null or coverage<=0 or coverage>70 or term is null or term not between 1 and 360 or grace<0 or grace>=term or coalesce(nullif(p_form->>'interestRate','')::numeric,0)>100 then raise exception 'Check amount, coverage (0–70 percent), term, grace period and interest rate' using errcode='22023'; end if;
 if nullif(p_form->>'establishmentYear','')::integer not between 1800 and extract(year from current_date)::integer then raise exception 'Invalid establishment year' using errcode='22023'; end if;
 if nullif(p_form->>'legalRepGender','') is not null and p_form->>'legalRepGender' not in ('male','female') then raise exception 'Invalid representative gender' using errcode='22023'; end if;
 if nullif(p_form->>'legalRepBirthdate','')::date>current_date-interval '18 years' or nullif(p_form->>'legalRepBirthdate','')::date<current_date-interval '100 years' then raise exception 'Representative must be 18–100 years old' using errcode='22023'; end if;
 if nullif(p_form->>'applicationDate','')::date>current_date or nullif(p_form->>'bankApprovalDate','')::date>current_date then raise exception 'Application and bank approval dates cannot be in the future' using errcode='22023'; end if;
 if p_form ? 'guarantors' then
  if jsonb_typeof(p_form->'guarantors')<>'array' then raise exception 'Invalid guarantors' using errcode='22023'; end if;
  if jsonb_array_length(p_form->'guarantors')>20 then raise exception 'Maximum 20 guarantors' using errcode='22023'; end if;
  for entry in select value from jsonb_array_elements(p_form->'guarantors') loop
   if jsonb_typeof(entry.value)<>'object' or exists(select 1 from jsonb_each(entry.value) x where x.key not in ('name','id_number','relationship') or jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>500) then raise exception 'Invalid guarantor fields' using errcode='22023'; end if;
  end loop;
 end if;
 branch:=nullif(p_form->>'branchId','')::uuid; sector:=nullif(p_form->>'sectorId','')::uuid; product:=nullif(p_form->>'productId','')::uuid;
 if not exists(select 1 from public.banks where id=bank and is_active) or (branch is not null and not exists(select 1 from public.bank_branches where id=branch and bank_id=bank and is_active)) then raise exception 'Choose an active bank and matching branch' using errcode='23514'; end if;
 if sector is null or not exists(select 1 from public.sectors where id=sector and is_active and not is_prohibited) then raise exception 'Choose an active eligible sector' using errcode='23514'; end if;
 if product is not null and not exists(select 1 from public.loan_products where id=product and is_active) then raise exception 'Choose an active product' using errcode='23514'; end if;
 if nullif(p_form->>'loanOfficer','') is not null and not exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id::text=p_form->>'loanOfficer' and p.bank_id=bank and p.is_active and r.is_active and r.code='bank_officer') then raise exception 'Choose an active loan officer from this bank' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended('borrower-tin:'||(p_form->>'clientTin'),0));
 select id into b from public.borrowers where tin_number=p_form->>'clientTin' order by created_at,id limit 1;
 if existing and (b is distinct from l.borrower_id) then raise exception 'Borrower identity cannot be changed on an existing application' using errcode='23514'; end if;
 if b is null then
  if nullif(p_form->>'bankCustomerCode','') is not null and exists(select 1 from public.borrowers where customer_code=p_form->>'bankCustomerCode') then raise exception 'Customer code is already assigned; use another code or leave it blank' using errcode='23505'; end if;
  insert into public.borrowers(tin_number,legal_type,name,registration_number,sector_id,address_street,address_city,address_district,phone,email,legal_rep_surname,legal_rep_name,legal_rep_patronymic,legal_rep_gender,legal_rep_birthdate,legal_rep_country_of_birth,legal_rep_tin,workforce_count,customer_code,created_by)
  values(p_form->>'clientTin',case p_form->>'legalEntityType' when 'legal_entity' then 'llc' else 'sole_proprietor' end,btrim(p_form->>'clientName'),nullif(p_form->>'registrationNumber',''),sector,nullif(p_form->>'addressStreet',''),nullif(p_form->>'city',''),nullif(p_form->>'district',''),nullif(p_form->>'phone',''),nullif(p_form->>'email',''),nullif(p_form->>'legalRepSurname',''),nullif(p_form->>'legalRepName',''),nullif(p_form->>'legalRepPatronymic',''),nullif(p_form->>'legalRepGender',''),nullif(p_form->>'legalRepBirthdate','')::date,nullif(p_form->>'legalRepCountry',''),nullif(p_form->>'legalRepTin',''),nullif(p_form->>'workforce','')::integer,nullif(p_form->>'bankCustomerCode',''),actor) returning id into b;
 end if;
 previous:=case when existing then to_jsonb(l) end;
 if existing then
  update public.loan_applications set branch_id=branch,product_id=product,sector_id=sector,approved_amount=amount,currency=p_form->>'currency',duration_months=term,grace_period_months=grace,interest_rate=nullif(p_form->>'interestRate','')::numeric,frequency=p_form->>'frequency',guarantee_coverage=coverage,guarantee_amount=round(amount*coverage/100,2),loan_officer=nullif(p_form->>'loanOfficer',''),purpose=nullif(p_form->>'purpose',''),notes=nullif(p_form->>'notes',''),loan_approval_date=nullif(p_form->>'bankApprovalDate','')::date,intake_data=p_form,intake_revision=intake_revision+1,authority_reason=p_reason where id=p_id returning * into l;
 else
  insert into public.loan_applications(id,loan_request_id,bank_id,branch_id,borrower_id,product_id,sector_id,approved_amount,currency,duration_months,grace_period_months,interest_rate,frequency,guarantee_coverage,guarantee_amount,loan_officer,purpose,notes,loan_approval_date,status,created_by,authority_reason,intake_data)
  values(p_id,'LR-'||replace(p_id::text,'-',''),bank,branch,b,product,sector,amount,p_form->>'currency',term,grace,nullif(p_form->>'interestRate','')::numeric,p_form->>'frequency',coverage,round(amount*coverage/100,2),nullif(p_form->>'loanOfficer',''),nullif(p_form->>'purpose',''),nullif(p_form->>'notes',''),nullif(p_form->>'bankApprovalDate','')::date,'draft',actor,p_reason,p_form) returning * into l;
 end if;
 insert into public.audit_trail(table_name,record_id,action,old_data,new_data,changed_by) values('loan_applications',p_id,case when existing then 'UPDATE' else 'INSERT' end,previous,jsonb_build_object('application',to_jsonb(l),'reason',p_reason),actor);
 if p_draft is not null then delete from public.loan_drafts where id=p_draft and user_id=actor; end if;
 return jsonb_build_object('id',l.id,'status',l.status,'revision',l.intake_revision,'replayed',false);
end $$;
revoke all on function public.cgf_save_application(uuid,jsonb,bigint,text,uuid,text) from public,anon;
grant execute on function public.cgf_save_application(uuid,jsonb,bigint,text,uuid,text) to authenticated;
commit;
