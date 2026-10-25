begin;
do $$
declare
  actor record; admin_id uuid; original_revision bigint; revision bigint; saved jsonb;
  policy jsonb := '{"schema_version":1,"currencies":["TJS","USD"],"settlement_currency":"loan_currency","fx_date":"transaction_date","claims":{"allow_partial_payments":false,"separate_payment_actor":true,"authorities":[{"role_code":"accountant","currency":"TJS","per_payment_limit":100,"per_claim_limit":200}]},"recoveries":{"allocation":"fixed_percentage","fund_share_percent":50,"costs":"no_deduction","cap_at_paid_amount":true},"fees":{"base":"guarantee_amount","upfront_rate_percent":0,"recurring_rate_percent":0,"recurring_rate_basis":"quarterly","proration":"none","rounding":"half_up","decimal_places":2,"due_days":30}}';
  invalid jsonb; policy_count bigint; audit_count bigint; roles_tested integer:=0;
  fixture text:='FINANCIAL-POLICY-REGRESSION-'||gen_random_uuid()::text;
begin
  select p.id into admin_id from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and r.code='super_admin' limit 1;
  assert admin_id is not null, 'Existing Super Admin required; do not reset or provision accounts';
  select coalesce(max(v.revision),0) into original_revision from public.financial_policy_versions v;
  revision:=original_revision;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';
  saved:=public.cgf_save_financial_policy(policy,fixture,revision);
  revision:=(saved->>'revision')::bigint;
  execute 'reset role';
  for actor in select distinct on (r.code) p.id,r.code from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active order by r.code,p.id loop
    perform set_config('request.jwt.claim.sub',actor.id::text,true);
    execute 'set local role authenticated';
    if actor.code in ('super_admin','prsf_admin') then
      saved:=public.cgf_save_financial_policy(policy,fixture,revision);
      assert (saved->>'revision')::bigint>revision, 'Admin save returned no new revision';
      assert saved->'policy'=policy, 'Saved policy changed values';
      revision:=(saved->>'revision')::bigint;
    else
      begin perform public.cgf_save_financial_policy(policy,fixture,revision); raise exception 'Nonadministrator saved policy: %',actor.code;
      exception when insufficient_privilege then null; end;
    end if;
    if revision>original_revision then
      if actor.code in ('legal_officer','bank_admin','bank_officer') then
        assert not exists(select 1 from public.financial_policy_versions where reason=fixture), 'Non-Fund policy read allowed';
      else
        assert exists(select 1 from public.financial_policy_versions where reason=fixture), 'Authorized Fund policy history hidden';
      end if;
    end if;
    begin insert into public.financial_policy_versions(policy,reason,created_by) values(policy,fixture,actor.id); raise exception 'Direct policy insert allowed'; exception when insufficient_privilege then null; end;
    begin update public.financial_policy_versions set reason='forged'; raise exception 'Direct policy update allowed'; exception when insufficient_privilege then null; end;
    begin delete from public.financial_policy_versions; raise exception 'Direct policy delete allowed'; exception when insufficient_privilege then null; end;
    execute 'reset role';
    roles_tested:=roles_tested+1;
  end loop;
  assert roles_tested=(select count(distinct r.code) from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active), 'An available role identity was not exercised';
  assert roles_tested>=2, 'Insufficient existing role identities for authorization checks';
  assert revision>original_revision, 'No administrator saved a policy';
  assert (select count(*) from public.audit_trail where table_name='financial_policy_versions' and new_data->>'reason'=fixture)=(select count(*) from public.financial_policy_versions where reason=fixture), 'Policy audit count mismatch';
  assert not exists(select 1 from public.financial_policy_versions v where reason=fixture and not exists(select 1 from public.audit_trail a where a.record_id=v.id and a.changed_by=v.created_by and a.new_data->'policy'=(saved->'policy') and a.table_name='financial_policy_versions')), 'Missing exact policy audit';
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';
  begin perform public.cgf_save_financial_policy(policy,fixture,original_revision); raise exception 'Stale policy revision accepted'; exception when serialization_failure then null; end;
  begin perform public.cgf_save_financial_policy(policy,' ',revision); raise exception 'Blank reason accepted'; exception when check_violation then null; end;
  begin perform public.cgf_save_financial_policy(policy,fixture,null); raise exception 'Missing expected revision accepted'; exception when check_violation then null; end;
  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    'null'::jsonb,'{}'::jsonb,'[]'::jsonb,
    policy||'{"unexpected":true}',
    jsonb_set(policy,'{currencies}','[]'),jsonb_set(policy,'{currencies}','["TJS","TJS"]'),jsonb_set(policy,'{currencies}','["GBP"]'),
    jsonb_set(policy,'{claims,authorities,0,role_code}','"super_admin"'),jsonb_set(policy,'{claims,authorities,0,role_code}','"prsf_admin"'),jsonb_set(policy,'{claims,authorities,0,role_code}','"auditor"'),jsonb_set(policy,'{claims,authorities,0,role_code}','"bank_admin"'),
    jsonb_set(policy,'{claims,authorities,0,per_payment_limit}','0'),jsonb_set(policy,'{claims,authorities,0,per_payment_limit}','201'),jsonb_set(policy,'{claims,authorities,0,per_payment_limit}','"100"'),
    jsonb_set(policy,'{claims,authorities}',(policy#>'{claims,authorities}')||(policy#>'{claims,authorities}')),
    jsonb_set(policy,'{recoveries,fund_share_percent}','null'),jsonb_set(policy,'{recoveries,fund_share_percent}','101'),jsonb_set(policy,'{recoveries,cap_at_paid_amount}','false'),
    jsonb_set(policy,'{fees,upfront_rate_percent}','-1'),jsonb_set(policy,'{fees,recurring_rate_percent}','101'),jsonb_set(policy,'{fees,decimal_places}','1.5'),jsonb_set(policy,'{fees,due_days}','366'),jsonb_set(policy,'{fees,recurring_rate_basis}','"annual"')
  )) loop
    begin perform public.cgf_save_financial_policy(invalid,fixture,revision); raise exception 'Invalid policy accepted: %',invalid; exception when check_violation then null; end;
  end loop;
  execute 'reset role';
  select count(*) into policy_count from public.financial_policy_versions;
  select count(*) into audit_count from public.audit_trail where table_name='financial_policy_versions';
  execute 'set local role authenticated';
  begin
    perform public.cgf_save_financial_policy(policy,fixture||'-ROLLBACK',revision);
    raise no_data_found;
  exception when no_data_found then null; end;
  execute 'reset role';
  assert (select count(*) from public.financial_policy_versions)=policy_count, 'Failed transaction left a policy revision';
  assert (select count(*) from public.audit_trail where table_name='financial_policy_versions')=audit_count, 'Failed transaction left an audit';
  begin update public.financial_policy_versions set reason='mutated' where reason=fixture; raise exception 'Immutable revision changed'; exception when insufficient_privilege then null; end;
  begin delete from public.financial_policy_versions where reason=fixture; raise exception 'Immutable revision deleted'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  execute 'set local role authenticated';
  assert not exists(select 1 from public.financial_policy_versions), 'Unknown identity read policy';
  begin perform public.cgf_save_financial_policy(policy,fixture,revision); raise exception 'Unknown identity saved policy'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role anon';
  begin perform id from public.financial_policy_versions; raise exception 'Anonymous policy read allowed'; exception when insufficient_privilege then null; end;
  begin perform public.cgf_save_financial_policy(policy,fixture,revision); raise exception 'Anonymous policy save allowed'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  raise notice 'Financial policy validation, % active roles, immutable audit, stale revisions and rollback checks passed',roles_tested;
end $$;
rollback;
