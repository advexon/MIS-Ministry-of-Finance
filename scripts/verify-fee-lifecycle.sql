begin;
set local statement_timeout='20s';
set local lock_timeout='2s';

-- Run as the database administrator in one request, never as a committed seed.
-- Only synthetic parent staging skips the pipeline guard; every fee assertion
-- runs with all production triggers, grants, helpers and RLS enabled.
do $test$
declare
  administrator uuid; parent_bank uuid; parent_borrower uuid; other_bank uuid;
  loan uuid:=gen_random_uuid(); second_loan uuid:=gen_random_uuid(); guarantee uuid:=gen_random_uuid();
  fee uuid:=gen_random_uuid(); failed_fee uuid:=gen_random_uuid(); second_fee uuid:=gen_random_uuid();
  fixture text:='FEEQA_'||replace(gen_random_uuid()::text,'-','');
  failure_reason text; audit_constraint text; prior_revision bigint; revision bigint; newer_revision bigint;
  receipt jsonb; assessed jsonb; invoiced jsonb; paid jsonb; member record; terms jsonb;
  allowed boolean; readable boolean; role_count integer:=0; authority_count integer:=0; isolation_count integer:=0;
  policy jsonb:='{"schema_version":1,"currencies":["TJS"],"settlement_currency":"loan_currency","fx_date":"transaction_date","claims":{"allow_partial_payments":true,"separate_payment_actor":true,"authorities":[{"role_code":"fkg_management","currency":"TJS","per_payment_limit":300,"per_claim_limit":500}]},"recoveries":{"allocation":"fixed_percentage","fund_share_percent":50,"costs":"no_deduction","cap_at_paid_amount":true},"fees":{"base":"guarantee_amount","upfront_rate_percent":0.5,"recurring_rate_percent":0.5,"recurring_rate_basis":"quarterly","proration":"none","rounding":"half_up","decimal_places":4,"due_days":30}}';
begin
  select p.id into administrator from public.profiles p join public.roles r on r.id=p.role_id
    where p.is_active and r.is_active and p.bank_id is null and r.code='super_admin' and r.tier=1 order by p.id limit 1;
  select bank_id,borrower_id into parent_bank,parent_borrower from public.loan_applications order by id limit 1;
  select b.id into other_bank from public.banks b where b.id<>parent_bank order by b.id limit 1;
  assert administrator is not null and parent_bank is not null and parent_borrower is not null and other_bank is not null,
    'Existing canonical administrator and parent fixtures required; do not provision accounts';
  failure_reason:=fixture||'-AUDIT-FAIL';
  perform set_config('request.jwt.claim.sub',administrator::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  insert into public.loan_applications(id,loan_request_id,loan_number,bank_id,borrower_id,status,currency,approved_amount,guarantee_amount,authority_reason)
    values(loan,fixture,fixture,parent_bank,parent_borrower,'draft','TJS',100000,50000,fixture),
      (second_loan,fixture||'-OTHER',fixture||'-OTHER',other_bank,parent_borrower,'draft','TJS',100000,50000,fixture);
  alter table public.loan_applications disable trigger cgf_pipeline_guard;
  update public.loan_applications set status='active' where id in (loan,second_loan);
  alter table public.loan_applications enable trigger cgf_pipeline_guard;
  assert (select tgenabled='O' from pg_trigger where tgrelid='public.loan_applications'::regclass and tgname='cgf_pipeline_guard'), 'Pipeline guard not restored';
  terms:=jsonb_build_object('loan_id',loan,'bank_id',parent_bank,'currency','TJS','approved_amount',100000,'guarantee_amount',50000);
  insert into public.guarantee_letters(id,loan_id,guarantee_number,issued_by_user_id,metadata)
    values(guarantee,loan,fixture,administrator,jsonb_build_object('terms',terms)),
      (gen_random_uuid(),second_loan,fixture||'-OTHER',administrator,jsonb_build_object('terms',terms||jsonb_build_object('loan_id',second_loan,'bank_id',other_bank)));
  select coalesce(max(v.revision),0) into prior_revision from public.financial_policy_versions v;
  set local role authenticated;
  receipt:=public.cgf_save_financial_policy(policy,fixture,prior_revision);
  revision:=(receipt->>'revision')::bigint;
  reset role;
  execute format('alter table public.audit_trail add constraint cgf_fee_lifecycle_qa_audit_failure check(coalesce(new_data->>''notes'','''')<>%L and coalesce(new_data->>''last_action_reason'','''')<>%L) not valid',failure_reason,failure_reason);

  set local role authenticated;
  begin
    perform public.cgf_create_fee(failed_fee,loan,'upfront',current_date,null,null,null,failure_reason,revision);
    raise exception 'Failed assessment audit committed';
  exception when check_violation then
    get stacked diagnostics audit_constraint=constraint_name;
    if audit_constraint<>'cgf_fee_lifecycle_qa_audit_failure' then raise;end if;
  end;
  assert not exists(select 1 from public.fees where id=failed_fee),'Audit failure left assessed fee';
  assessed:=public.cgf_create_fee(fee,loan,'upfront',current_date,null,null,null,fixture,revision);
  assert assessed->>'id'=fee::text and assessed->>'status'='pending' and (assessed->>'fee_amount')::numeric=250 and assessed->>'currency'='TJS','Assessment receipt incorrect';
  assert assessed->'policy_snapshot'=policy and assessed#>'{calculation_inputs,original_terms}'=terms and assessed->>'recorded_by'=administrator::text,'Assessment snapshots or actor missing';
  assert (select fee_amount=250 and recorded_by=administrator from public.fees where id=fee),'Authenticated assessment read-back failed';
  assert public.cgf_create_fee(fee,loan,'upfront',current_date,null,null,null,fixture,revision)=assessed,'Assessment retry changed receipt';
  begin perform public.cgf_create_fee(fee,loan,'upfront',current_date,null,null,null,fixture||'-CHANGED',revision);raise exception 'Changed retry accepted';exception when unique_violation then null;end;
  begin perform public.cgf_create_fee(gen_random_uuid(),loan,'upfront',current_date,null,null,null,fixture,revision);raise exception 'Duplicate upfront fee accepted';exception when unique_violation then null;end;
  begin perform public.cgf_fee_action(fee,'pay',current_date,fixture,fixture);raise exception 'Payment before invoice accepted';exception when check_violation then null;end;
  begin
    perform public.cgf_fee_action(fee,'invoice',current_date,null,failure_reason);
    raise exception 'Failed invoice audit committed';
  exception when check_violation then
    get stacked diagnostics audit_constraint=constraint_name;
    if audit_constraint<>'cgf_fee_lifecycle_qa_audit_failure' then raise;end if;
  end;
  assert (select status='pending' and invoice_date is null from public.fees where id=fee),'Audit failure left invoice mutation';
  receipt:=public.cgf_save_financial_policy(jsonb_set(policy,'{fees,due_days}','60'),fixture||'-REVISION',revision);
  newer_revision:=(receipt->>'revision')::bigint;
  assert public.cgf_create_fee(fee,loan,'upfront',current_date,null,null,null,fixture,revision)=assessed,'Replay after policy change failed';
  begin perform public.cgf_create_fee(second_fee,second_loan,'upfront',current_date,null,null,null,fixture,revision);raise exception 'Stale policy accepted';exception when serialization_failure then null;end;
  invoiced:=public.cgf_fee_action(fee,'invoice',current_date,null,fixture);
  assert invoiced->>'status'='invoiced' and (invoiced->>'due_date')::date=current_date+30 and (invoiced->>'policy_revision')::bigint=revision,'Invoice did not freeze assessment policy';
  assert public.cgf_fee_action(fee,'invoice',current_date,null,fixture)=invoiced,'Invoice retry changed receipt';
  begin
    perform public.cgf_fee_action(fee,'pay',current_date,fixture,failure_reason);
    raise exception 'Failed payment audit committed';
  exception when check_violation then
    get stacked diagnostics audit_constraint=constraint_name;
    if audit_constraint<>'cgf_fee_lifecycle_qa_audit_failure' then raise;end if;
  end;
  assert (select status='invoiced' and payment_date is null and paid_date is null and payment_reference is null from public.fees where id=fee),'Audit failure left payment mutation';
  paid:=public.cgf_fee_action(fee,'pay',current_date,fixture,fixture);
  assert paid->>'status'='paid' and (paid->>'payment_date')::date=current_date and paid->>'paid_date'=paid->>'payment_date','Payment receipt incorrect';
  assert public.cgf_fee_action(fee,'pay',current_date,fixture,fixture)=paid,'Payment retry changed receipt';
  begin perform public.cgf_fee_action(fee,'pay',current_date,fixture||'-CHANGED',fixture);raise exception 'Changed payment retry accepted';exception when check_violation then null;end;
  perform public.cgf_create_fee(second_fee,second_loan,'upfront',current_date,null,null,null,fixture,newer_revision);
  reset role;
  assert (select count(*)=3 from public.audit_trail where table_name='fees' and record_id=fee and changed_by=administrator),'Lifecycle audit count or attribution incorrect';
  assert exists(select 1 from public.audit_trail where record_id=fee and action='FEE_ASSESSED' and new_data=assessed),'Exact assessment audit missing';
  assert exists(select 1 from public.audit_trail where record_id=fee and action='FEE_INVOICED' and old_data=assessed and new_data=invoiced),'Exact invoice before/after audit missing';
  assert exists(select 1 from public.audit_trail where record_id=fee and action='FEE_PAID' and old_data=invoiced and new_data=paid),'Exact payment before/after audit missing';
  assert not exists(select 1 from public.audit_trail where record_id=failed_fee),'Failed assessment left audit';
  begin update public.fees set amount=1 where id=fee;raise exception 'Paid history rewritten';exception when check_violation then null;end;
  begin delete from public.fees where id=fee;raise exception 'Paid history deleted';exception when check_violation then null;end;

  for member in select p.id,p.bank_id,r.code,r.tier from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active order by p.id loop
    role_count:=role_count+1;
    perform set_config('request.jwt.claim.sub',member.id::text,true);
    allowed:=member.bank_id is null and (member.code in ('prsf_admin','accountant') or (member.code='super_admin' and member.tier=1));
    readable:=member.code in ('prsf_admin','prsf_analyst','auditor','credit_risk_officer','compliance_officer','fkg_management','deputy_director','accountant','reporting_officer','business_development') or (member.code='super_admin' and member.tier=1 and member.bank_id is null);
    set local role authenticated;
    if allowed then
      authority_count:=authority_count+1;
      perform public.cgf_fee_action(second_fee,'invoice',current_date,null,fixture);
    else
      begin perform public.cgf_fee_action(second_fee,'invoice',current_date,null,fixture);raise exception 'Prohibited role invoiced: %',member.code;exception when insufficient_privilege then null;end;
      begin perform public.cgf_create_fee(gen_random_uuid(),loan,'upfront',current_date,null,null,null,fixture,newer_revision);raise exception 'Prohibited role assessed: %',member.code;exception when insufficient_privilege then null;end;
    end if;
    assert (select count(*) from public.fees where id=fee)=case when readable or (member.code in ('bank_admin','bank_officer') and member.bank_id=parent_bank) then 1 else 0 end,'Parent-bank fee visibility mismatch';
    assert (select count(*) from public.fees where id=second_fee)=case when readable or (member.code in ('bank_admin','bank_officer') and member.bank_id=other_bank) then 1 else 0 end,'Other-bank fee visibility mismatch';
    if member.code in ('bank_admin','bank_officer') and member.bank_id is not null then isolation_count:=isolation_count+1;end if;
    begin update public.fees set status='pending' where id=fee;raise exception 'Direct fee update allowed';exception when insufficient_privilege then null;end;
    begin delete from public.fees where id=fee;raise exception 'Direct fee deletion allowed';exception when insufficient_privilege then null;end;
    reset role;
  end loop;
  assert authority_count>0 and isolation_count>0,'No fee authority or bank-isolation path exercised';
  perform set_config('request.jwt.claim.sub','',true);
  set local role authenticated;
  assert not exists(select 1 from public.fees where id in (fee,second_fee)),'Missing identity read fee fixtures';
  begin perform public.cgf_fee_action(fee,'pay',current_date,fixture,fixture);raise exception 'Missing identity replayed payment';exception when insufficient_privilege then null;end;
  reset role;
  set local role anon;
  begin perform id from public.fees where id=fee;raise exception 'Anonymous fee read allowed';exception when insufficient_privilege then null;end;
  begin perform public.cgf_fee_action(fee,'pay',current_date,fixture,fixture);raise exception 'Anonymous fee action allowed';exception when insufficient_privilege then null;end;
  reset role;
  raise notice 'Fee lifecycle passed: % existing active identities, % fee authorities, % bank-isolation identities',role_count,authority_count,isolation_count;
end $test$;
rollback;
select 'Fee lifecycle acceptance passed; synthetic loans, guarantees, policies, fees, notifications, audits and constraint rolled back' as result;
