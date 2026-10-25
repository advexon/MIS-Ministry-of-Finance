begin;
do $$
declare
  actor uuid;
  bank uuid;
  sector uuid;
  application uuid := gen_random_uuid();
  tin text;
  form jsonb;
  receipt jsonb;
begin
  if not exists (
    select 1 from public.column_configurations
    where entity_type = 'form:loan_application' and column_key = 'branchId' and not is_required
  ) then
    raise exception 'Branch must be configured as optional';
  end if;
  select p.id into actor from public.profiles p join public.roles r on r.id = p.role_id
  where p.is_active and r.is_active and r.code = 'super_admin' and r.tier = 1 and p.bank_id is null limit 1;
  select id into bank from public.banks where is_active order by id limit 1;
  select id into sector from public.sectors where is_active and not is_prohibited order by id limit 1;
  if actor is null or bank is null or sector is null then
    raise exception 'An active administrator, bank and eligible sector are required';
  end if;
  loop
    tin := (100000000 + floor(random() * 899999999))::bigint::text;
    exit when not exists (select 1 from public.borrowers where tin_number = tin);
  end loop;
  form := jsonb_build_object(
    'legalEntityType', 'legal_entity', 'clientName', 'OPTIONAL_BRANCH_QA_' || application::text,
    'clientTin', tin, 'registrationNumber', 'QA', 'sectorId', sector,
    'addressStreet', 'QA street', 'city', 'QA city', 'phone', '+992901234567',
    'email', 'qa@finance.tj', 'workforce', '2', 'establishmentYear', '2000',
    'legalRepSurname', 'QA', 'legalRepName', 'Representative', 'legalRepGender', 'male',
    'legalRepBirthdate', '1980-01-01', 'legalRepTin', '123456789', 'passportNumber', 'QA',
    'bankId', bank, 'branchId', '', 'productId', '', 'requestedAmount', '10000',
    'currency', 'TJS', 'loanTerm', '12', 'gracePeriod', '0', 'frequency', 'monthly',
    'repaymentMethod', 'annuity', 'interestRate', '0', 'guaranteeCoverage', '50',
    'guaranteeType', 'individual', 'applicationDate', current_date::text,
    'purpose', 'working_capital', 'collateralDescription', 'QA collateral', 'notes', 'Rollback-only acceptance'
  );
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  receipt := public.cgf_save_application(application, form, null, null, null, 'Optional Branch rollback-only acceptance');
  if receipt->>'id' <> application::text or receipt->>'status' <> 'draft' then
    raise exception 'Branchless application did not return a valid receipt';
  end if;
  if not exists (select 1 from public.loan_applications where id = application and branch_id is null) then
    raise exception 'Empty Branch was not stored as NULL';
  end if;
  begin
    perform public.cgf_save_application(application, form || jsonb_build_object('branchId', gen_random_uuid()::text), 0, 'draft', null, 'Invalid Branch rollback-only acceptance');
    raise exception 'Nonexistent selected branch was accepted';
  exception when check_violation then
    null;
  end;
  reset role;
end $$;
rollback;
select 'PASS: branchless creation accepted; invalid selected branch rejected; all test records rolled back' as result;
