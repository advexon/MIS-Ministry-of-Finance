begin;
set local statement_timeout='30s';
do $test$
declare
  admin_id uuid; payer uuid; bank_actor uuid; bank uuid; borrower uuid; analyst uuid; risk uuid; compliance uuid;
  loan uuid; claim uuid; sitting uuid; payment uuid:=gen_random_uuid(); rejected_payment uuid:=gen_random_uuid(); final_payment uuid:=gen_random_uuid();
  role_actor record; member uuid; initial_revision bigint; revision bigint; prior_revision bigint; bad numeric; result jsonb; replay jsonb;
  fixture text:='CLAIM-PAYMENT-REGRESSION-'||gen_random_uuid()::text;
  terms jsonb; claim_terms jsonb; snapshot jsonb;
  policy jsonb:='{"schema_version":1,"currencies":["TJS","USD"],"settlement_currency":"loan_currency","fx_date":"transaction_date","claims":{"allow_partial_payments":true,"separate_payment_actor":true,"authorities":[{"role_code":"fkg_management","currency":"TJS","per_payment_limit":300,"per_claim_limit":500},{"role_code":"fkg_management","currency":"USD","per_payment_limit":300,"per_claim_limit":500}]},"recoveries":{"allocation":"fixed_percentage","fund_share_percent":50,"costs":"no_deduction","cap_at_paid_amount":true},"fees":{"base":"guarantee_amount","upfront_rate_percent":0,"recurring_rate_percent":0,"recurring_rate_basis":"quarterly","proration":"none","rounding":"half_up","decimal_places":2,"due_days":30}}';
begin
  assert to_regclass('public.claim_payments') is not null,'Apply migration 048 before running this regression';
  select p.id into admin_id from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and r.code='super_admin' limit 1;
  select p.id into payer from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and p.bank_id is null and r.code='fkg_management' limit 1;
  select p.id,p.bank_id into bank_actor,bank from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and p.bank_id is not null and r.code in ('bank_admin','bank_officer') limit 1;
  select p.id into analyst from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and p.bank_id is null and r.code='prsf_analyst' limit 1;
  select p.id into risk from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and p.bank_id is null and r.code='credit_risk_officer' limit 1;
  select p.id into compliance from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and p.bank_id is null and r.code='compliance_officer' limit 1;
  select borrower_id into borrower from public.loan_applications limit 1;
  assert admin_id is not null and payer is not null and bank_actor is not null and analyst is not null and risk is not null and compliance is not null and borrower is not null,'Existing identities and parent records required; do not provision or change employee roles';
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',bank_actor::text,true);
  insert into public.loan_applications(loan_request_id,loan_number,bank_id,borrower_id,status,currency,approved_amount,guarantee_amount)
    values(fixture,fixture,bank,borrower,'draft','TJS',1000,500) returning id into loan;
  -- Only rolled-back fixture staging bypasses the unrelated loan pipeline; all payment assertions use enabled guards.
  alter table public.loan_applications disable trigger cgf_pipeline_guard;
  update public.loan_applications set status='active' where id=loan;
  alter table public.loan_applications enable trigger cgf_pipeline_guard;
  insert into public.claims(claim_number,loan_id,loan_application_id,bank_id,claim_amount,claim_date,status)
    values(fixture,loan,loan,bank,700,current_date,'pending') returning id into claim;
  terms:=jsonb_build_object('loan_id',loan,'bank_id',bank,'currency','TJS','approved_amount',1000,'guarantee_amount',500);
  insert into public.guarantee_letters(loan_id,guarantee_number,metadata) values(loan,fixture,jsonb_build_object('terms',terms));
  claim_terms:=cgf_private.claim_terms(claim);
  insert into public.claim_committee_sittings(claim_id,meeting_no,secretary_id,original_terms,claim_terms,original_amount_tjs,director_threshold_tjs,recommended_amount)
    values(claim,fixture,analyst,terms,claim_terms,1000,1000000,500) returning id into sitting;
  -- Synthetic signed evidence exists only inside this rollback transaction; no real votes, flags or sign-offs are changed.
  foreach member in array array[analyst,risk,compliance] loop
    insert into public.claim_committee_members(sitting_id,member_id,role_code,attended,signed_at)
      values(sitting,member,case member when analyst then 'prsf_analyst' when risk then 'credit_risk_officer' else 'compliance_officer' end,true,now());
    insert into public.claim_committee_votes(sitting_id,member_id,vote) values(sitting,member,'for');
  end loop;
  snapshot:=jsonb_build_object('outcome','approved','claim_terms',claim_terms,'original_terms',terms,'recommended_amount',500);
  update public.claim_committee_sittings set status='closed',outcome='approved',protocol_no=fixture,protocol_snapshot=snapshot,closed_at=now() where id=sitting;
  update public.claims set status='approved',approved_amount=500,approved_date=current_date,reviewed_by=analyst where id=claim;

  select coalesce(max(v.revision),0) into initial_revision from public.financial_policy_versions v;
  if initial_revision=0 then
    perform set_config('request.jwt.claim.sub',payer::text,true);
    execute 'set local role authenticated';
    begin perform public.cgf_record_claim_payment(payment,claim,250,'TJS',current_date,fixture,'Regression payment',1);raise exception 'Missing policy accepted';exception when check_violation then null;end;
    execute 'reset role';
  end if;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';
  result:=public.cgf_save_financial_policy(policy,fixture,initial_revision);
  revision:=(result->>'revision')::bigint;
  execute 'reset role';
  for role_actor in select distinct on(r.code) p.id,r.code from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active order by r.code,p.id loop
    if role_actor.code in ('super_admin','accountant','deputy_director','fkg_management') then continue;end if;
    perform set_config('request.jwt.claim.sub',role_actor.id::text,true);
    execute 'set local role authenticated';
    begin perform public.cgf_record_claim_payment(payment,claim,250,'TJS',current_date,fixture,'Regression payment',revision);raise exception 'Unauthorized role recorded payment: %',role_actor.code;exception when insufficient_privilege then null;end;
    execute 'reset role';
  end loop;
  perform set_config('request.jwt.claim.sub',payer::text,true);
  execute 'set local role authenticated';
  foreach bad in array array[0::numeric,-1,0.001,1000000000001,'NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric] loop
    begin perform public.cgf_record_claim_payment(payment,claim,bad,'TJS',current_date,fixture,'Regression payment',revision);raise exception 'Invalid amount accepted: %',bad;exception when check_violation then null;end;
  end loop;
  begin perform public.cgf_record_claim_payment(payment,claim,250,'TJS',current_date+1,fixture,'Regression payment',revision);raise exception 'Future payment accepted';exception when check_violation then null;end;
  begin perform public.cgf_record_claim_payment(payment,claim,250,'TJS',current_date-1,fixture,'Regression payment',revision);raise exception 'Preapproval payment accepted';exception when check_violation then null;end;
  begin perform public.cgf_record_claim_payment(payment,claim,250,'TJS',current_date,fixture,'Regression payment',revision-1);raise exception 'Stale revision accepted';exception when serialization_failure or check_violation then null;end;
  begin perform public.cgf_record_claim_payment(payment,claim,250,'USD',current_date,fixture,'Regression payment',revision);raise exception 'Currency mismatch accepted';exception when check_violation then null;end;
  begin perform public.cgf_record_claim_payment(payment,claim,301,'TJS',current_date,fixture,'Regression payment',revision);raise exception 'Per-payment limit bypassed';exception when check_violation then null;end;
  begin update public.claims set paid_amount=250 where id=claim;raise exception 'Direct claim payment allowed';exception when insufficient_privilege then null;end;
  assert not has_table_privilege('authenticated','public.claim_payments','INSERT,UPDATE,DELETE,TRUNCATE'),'Ledger mutation grant exposed';
  execute 'reset role';

  update public.claims set reviewed_by=payer where id=claim;
  execute 'set local role authenticated';
  begin perform public.cgf_record_claim_payment(payment,claim,250,'TJS',current_date,fixture,'Regression payment',revision);raise exception 'Separate-actor rule bypassed';exception when insufficient_privilege then null;end;
  execute 'reset role';
  update public.claims set reviewed_by=analyst,paid_amount=1 where id=claim;
  execute 'set local role authenticated';
  begin perform public.cgf_record_claim_payment(payment,claim,250,'TJS',current_date,fixture,'Regression payment',revision);raise exception 'Unreconciled legacy payment accepted';exception when check_violation then null;end;
  execute 'reset role';
  update public.claims set paid_amount=null where id=claim;
  update public.guarantee_letters set revoked=true where loan_id=loan;
  execute 'set local role authenticated';
  begin perform public.cgf_record_claim_payment(payment,claim,250,'TJS',current_date,fixture,'Regression payment',revision);raise exception 'Revoked guarantee accepted';exception when check_violation then null;end;
  execute 'reset role';
  update public.guarantee_letters set revoked=false where loan_id=loan;

  execute format('alter table public.audit_trail add constraint cgf_test_payment_audit_failure check(record_id is distinct from %L::uuid) not valid',rejected_payment);
  execute 'set local role authenticated';
  begin perform public.cgf_record_claim_payment(rejected_payment,claim,250,'TJS',current_date,fixture||'-FAIL','Regression payment',revision);raise exception 'Forced audit failure committed';exception when check_violation then null;end;
  execute 'reset role';
  alter table public.audit_trail drop constraint cgf_test_payment_audit_failure;
  assert not exists(select 1 from public.claim_payments where claim_id=claim),'Failed audit left ledger entries';
  assert (select paid_amount is null and status='approved' from public.claims where id=claim),'Failed audit changed claim';
  assert not exists(select 1 from public.loan_application_history where loan_id=loan and action='claim_payment'),'Failed audit left payment history';

  execute 'set local role authenticated';
  result:=public.cgf_record_claim_payment(payment,claim,250,'TJS',current_date,fixture,'Regression payment',revision);
  replay:=public.cgf_record_claim_payment(payment,claim,250,'TJS',current_date,fixture,'Regression payment',revision);
  assert replay=result,'Exact replay did not return original receipt';
  assert result->>'id'=payment::text and result->>'claim_status'='approved' and (result->>'cumulative_paid')::numeric=250,'Partial payment receipt incorrect';
  begin perform public.cgf_record_claim_payment(payment,claim,249,'TJS',current_date,fixture,'Regression payment',revision);raise exception 'Changed idempotent request accepted';exception when unique_violation then null;end;
  begin perform public.cgf_record_claim_payment(gen_random_uuid(),claim,1,'TJS',current_date,lower(fixture),'Regression payment',revision);raise exception 'Duplicate reference accepted';exception when unique_violation then null;end;
  execute 'reset role';
  assert (select count(*)=1 from public.claim_payments where claim_id=claim),'Retry duplicated ledger';
  assert (select status='claim_pending' from public.loan_applications where id=loan),'Partial payment finalized loan';
  assert (select count(*)=1 from public.audit_trail where record_id=payment and action='CLAIM_PAYMENT_RECORDED' and changed_by=payer and new_data=result),'Exact immutable payment audit missing';
  assert result->'policy_snapshot'=policy and result->'evidence'->'protocol'=snapshot and jsonb_array_length(result->'evidence'->'signatures')=3,'Policy or signed evidence snapshot missing';
  begin update public.claim_payments set amount=1 where id=payment;raise exception 'Immutable ledger updated';exception when insufficient_privilege then null;end;
  begin delete from public.claim_payments where id=payment;raise exception 'Immutable ledger deleted';exception when insufficient_privilege then null;end;

  prior_revision:=revision;
  policy:=jsonb_set(policy,'{claims,authorities,0,per_claim_limit}','400');
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  result:=public.cgf_save_financial_policy(policy,fixture,revision);revision:=(result->>'revision')::bigint;
  perform set_config('request.jwt.claim.sub',payer::text,true);
  execute 'set local role authenticated';
  begin perform public.cgf_record_claim_payment(final_payment,claim,250,'TJS',current_date,fixture||'-FINAL','Final payment',revision);raise exception 'Cumulative limit bypassed';exception when check_violation then null;end;
  replay:=public.cgf_record_claim_payment(payment,claim,250,'TJS',current_date,fixture,'Regression payment',prior_revision);
  assert (replay->>'id')::uuid=payment,'Exact retry after policy change failed';
  execute 'reset role';
  policy:=jsonb_set(policy,'{claims,authorities,0,per_claim_limit}','500');
  policy:=jsonb_set(policy,'{claims,allow_partial_payments}','false');
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  result:=public.cgf_save_financial_policy(policy,fixture,revision);revision:=(result->>'revision')::bigint;
  perform set_config('request.jwt.claim.sub',payer::text,true);
  execute 'set local role authenticated';
  begin perform public.cgf_record_claim_payment(final_payment,claim,249,'TJS',current_date,fixture||'-FINAL','Final payment',revision);raise exception 'No-partial rule bypassed';exception when check_violation then null;end;
  result:=public.cgf_record_claim_payment(final_payment,claim,250,'TJS',current_date,fixture||'-FINAL','Final payment',revision);
  replay:=public.cgf_record_claim_payment(final_payment,claim,250,'TJS',current_date,fixture||'-FINAL','Final payment',revision);
  assert replay=result and result->>'claim_status'='paid','Final payment replay failed';
  begin perform public.cgf_record_claim_payment(gen_random_uuid(),claim,1,'TJS',current_date,fixture||'-EXCESS','Excess payment',revision);raise exception 'Paid claim paid again';exception when check_violation then null;end;
  execute 'reset role';
  assert (select paid_amount=500 and status='paid' from public.claims where id=claim),'Final claim balance incorrect';
  assert (select status='claim_paid' from public.loan_applications where id=loan),'Final payment did not finalize loan';
  assert (select count(*)=1 from public.loan_application_history where loan_id=loan and new_status='claim_paid' and performed_by=payer),'Final status history missing or duplicated';
  assert (select count(*)=2 and sum(amount)=500 from public.claim_payments where claim_id=claim),'Ledger total incorrect';
  for role_actor in select distinct on(r.code,p.bank_id) p.id,r.code,p.bank_id from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active order by r.code,p.bank_id,p.id loop
    perform set_config('request.jwt.claim.sub',role_actor.id::text,true);
    execute 'set local role authenticated';
    if (role_actor.bank_id is null and role_actor.code in ('super_admin','prsf_admin','accountant','auditor','fkg_management','deputy_director','credit_risk_officer','compliance_officer','prsf_analyst','reporting_officer','business_development'))
      or (role_actor.code in ('bank_admin','bank_officer') and role_actor.bank_id=bank) then
      assert (select count(*)=2 from public.claim_payments where claim_id=claim),'Authorized payment history hidden';
    else assert not exists(select 1 from public.claim_payments where claim_id=claim),'Payment history leaked across bank or role';end if;
    execute 'reset role';
  end loop;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  execute 'set local role authenticated';
  assert not exists(select 1 from public.claim_payments),'Missing identity read payment ledger';
  begin perform public.cgf_record_claim_payment(payment,claim,250,'TJS',current_date,fixture,'Regression payment',prior_revision);raise exception 'Missing identity replayed payment';exception when insufficient_privilege then null;end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role anon';
  begin perform id from public.claim_payments;raise exception 'Anonymous ledger read allowed';exception when insufficient_privilege then null;end;
  begin perform public.cgf_record_claim_payment(payment,claim,250,'TJS',current_date,fixture,'Regression payment',prior_revision);raise exception 'Anonymous payment allowed';exception when insufficient_privilege then null;end;
  execute 'reset role';
end $test$;
rollback;
select 'Claim payment regression passed; all synthetic financial records rolled back' as result;
