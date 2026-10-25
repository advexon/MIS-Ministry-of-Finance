begin;
set local statement_timeout='30s';
do $test$
declare administrator uuid; actor record; baseline text; reason text:='AUTHORITY-ROLLBACK-'||gen_random_uuid()::text; missing uuid:=gen_random_uuid(); n integer; audit_count bigint;
begin
 select p.id into administrator from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and p.bank_id is null and r.is_active and r.code='super_admin' and r.tier=1 limit 1;
 assert administrator is not null,'An existing active Super Administrator is required';
 perform set_config('request.jwt.claim.sub',administrator::text,true);
 execute 'set local role authenticated';
 assert public.cgf_is_super_admin(),'Verified administrator predicate failed';
 begin perform public.cgf_transition_loan(missing,'draft','submitted'); raise exception 'Reason-free administrator transition accepted'; exception when check_violation then null; end;
 begin perform public.cgf_committee_action('vote',missing,jsonb_build_object('authority_reason',reason)); raise exception 'Missing meeting accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.cgf_confirm_deputy(missing,reason); raise exception 'Missing deputy evidence accepted'; exception when check_violation then null; end;
 begin perform public.cgf_sign_guarantee(missing,reason); raise exception 'Missing signing evidence accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.cgf_record_claim_payment(missing,missing,-1,'TJS',current_date,'ROLLBACK-ONLY',reason,1); raise exception 'Negative administrator payment accepted'; exception when check_violation then null; end;
 select value into baseline from public.system_settings where key='risk_review_threshold_usd';
 perform public.cgf_save_settings(jsonb_build_array(jsonb_build_object('key','risk_review_threshold_usd','value','9999','expected_value',baseline)),reason);
 assert (select value='9999' from public.system_settings where key='risk_review_threshold_usd'),'Setting save/reload failed';
 assert exists(select 1 from public.audit_trail where table_name='system_settings' and action='CONFIGURATION_CHANGED' and changed_by=administrator and new_data->>'reason'=reason),'Atomic settings audit missing';
 begin perform public.cgf_save_settings(jsonb_build_array(jsonb_build_object('key','risk_review_threshold_usd','value','8888','expected_value','stale')),reason); raise exception 'Stale setting accepted'; exception when serialization_failure then null; end;
 select count(*) into audit_count from public.audit_trail where changed_by=administrator and new_data->>'reason'=reason;
 begin
  perform public.cgf_save_settings(jsonb_build_array(jsonb_build_object('key','risk_review_threshold_usd','value','7777','expected_value','9999'),jsonb_build_object('key','unsupported_setting','value','1','expected_value',null)),reason);
  raise exception 'Unsupported setting accepted';
 exception when check_violation then null; end;
 assert (select value='9999' from public.system_settings where key='risk_review_threshold_usd'),'Failed batch left a partial setting';
 assert (select count(*)=audit_count from public.audit_trail where changed_by=administrator and new_data->>'reason'=reason),'Failed batch left partial audits';
 execute 'reset role';
 for actor in select distinct on(r.code) p.id,r.code,p.bank_id from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and r.code in ('prsf_admin','auditor','legal_officer','bank_admin','bank_officer') order by r.code,p.id loop
  perform set_config('request.jwt.claim.sub',actor.id::text,true);
  execute 'set local role authenticated';
  assert not public.cgf_is_super_admin(),'Other role acquired administrator authority';
  begin perform public.cgf_committee_action('vote',missing,jsonb_build_object('authority_reason',reason)); raise exception 'Other role acquired committee authority'; exception when insufficient_privilege then null; end;
  begin perform public.cgf_record_claim_payment(missing,missing,1,'TJS',current_date,'ROLLBACK-ONLY',reason,1); raise exception 'Other role acquired payment authority'; exception when insufficient_privilege then null; end;
  if actor.code in ('bank_admin','bank_officer') then assert not exists(select 1 from public.loan_applications where bank_id is distinct from actor.bank_id),'Bank isolation failed'; end if;
  execute 'reset role';
 end loop;
 assert not has_table_privilege('authenticated','public.claim_payments','INSERT,UPDATE,DELETE,TRUNCATE'),'Ledger direct-write grant exposed';
 assert not has_table_privilege('authenticated','public.system_settings','INSERT,UPDATE,DELETE'),'Settings bypass exposed';
 assert not has_function_privilege('anon','public.cgf_assume_committee_seat(boolean,uuid,uuid,text)','EXECUTE'),'Anonymous authority exposed';
end $test$;
rollback;
select 'Administrator authority, prerequisites, configuration CAS/audit rollback and negative-role checks passed; no persistent changes' as result;
