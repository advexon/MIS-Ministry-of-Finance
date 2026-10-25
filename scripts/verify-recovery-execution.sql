begin;
set local statement_timeout='30s';
do $test$
declare
 rule jsonb:='{"allocation":"fixed_percentage","fund_share_percent":50,"costs":"no_deduction","cap_at_paid_amount":true}';
 result jsonb; bad numeric; amount numeric; fraction numeric; previous numeric; actor record; administrator uuid; id uuid:=gen_random_uuid(); revision bigint; before_count bigint; before_audit bigint; checks integer:=0;
begin
 result:=cgf_private.allocate_recovery(rule,100,0,500,0,0.5);
 assert result->>'fund_share'='50.00' and result->>'bank_share'='50.00','Fixed allocation failed'; checks:=checks+1;
 result:=cgf_private.allocate_recovery(rule||'{"costs":"deduct_documented_costs"}',100,10,500,0,0.5);
 assert (result->>'fund_share')::numeric=45 and (result->>'bank_share')::numeric=45,'Cost deduction failed'; checks:=checks+1;
 result:=cgf_private.allocate_recovery(rule||'{"allocation":"coverage_pro_rata","fund_share_percent":null}',100,0,500,0,0.35);
 assert (result->>'fund_share')::numeric=35,'Original coverage allocation failed'; checks:=checks+1;
 result:=cgf_private.allocate_recovery(rule||'{"allocation":"fund_first","fund_share_percent":null}',100,0,500,450,0.5);
 assert (result->>'fund_share')::numeric=50 and (result->>'bank_share')::numeric=50,'Cumulative paid cap failed'; checks:=checks+1;
 result:=cgf_private.allocate_recovery(rule,0.01,0,500,0,0.5);
 assert (result->>'fund_share')::numeric=0.01 and (result->>'bank_share')::numeric=0,'Half-up rounding failed'; checks:=checks+1;
 result:=cgf_private.allocate_recovery(rule,100,0,500,500,0.5);
 assert (result->>'fund_share')::numeric=0 and (result->>'bank_share')::numeric=100,'Exhausted Fund cap failed'; checks:=checks+1;
 foreach amount in array array[0.01,0.03,1,99.99,1000,1000000000000]::numeric[] loop
  foreach fraction in array array[0,0.01,35,50,99.99,100]::numeric[] loop
   foreach previous in array array[0,499.99,500]::numeric[] loop
    result:=cgf_private.allocate_recovery(rule||jsonb_build_object('fund_share_percent',fraction),amount,0,500,previous,0.5);
    assert (result->>'fund_share')::numeric>=0 and (result->>'bank_share')::numeric>=0 and (result->>'fund_share')::numeric+(result->>'bank_share')::numeric=amount and (result->>'cumulative_fund_share')::numeric<=500,'Allocation conservation/cap failed';checks:=checks+1;
   end loop;
  end loop;
 end loop;
 foreach bad in array array['NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric,-1,0,0.001,1000000000001,null] loop
  begin perform cgf_private.allocate_recovery(rule,bad,0,500,0,0.5);raise exception 'Invalid amount accepted: %',bad;exception when check_violation then checks:=checks+1;end;
 end loop;
 begin perform cgf_private.allocate_recovery(rule,100,1,500,0,0.5);raise exception 'Disallowed deduction accepted';exception when check_violation then checks:=checks+1;end;
 begin perform cgf_private.allocate_recovery(rule,100,0,500,501,0.5);raise exception 'Over-recovered balance accepted';exception when check_violation then checks:=checks+1;end;
 begin perform cgf_private.allocate_recovery(rule||'{"costs":"deduct_documented_costs"}',100,101,500,0,0.5);raise exception 'Excess cost accepted';exception when check_violation then checks:=checks+1;end;
 select count(*) into before_count from public.recoveries;
 select count(*) into before_audit from public.audit_trail where table_name='recoveries';
 select p.id into administrator from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and p.bank_id is null and r.is_active and r.code='super_admin' and r.tier=1 limit 1;
 assert administrator is not null,'An existing verified administrator is required';
 select coalesce(max(v.revision),0) into revision from public.financial_policy_versions v;
 perform set_config('request.jwt.claim.sub',administrator::text,true);execute 'set local role authenticated';
 begin perform public.cgf_record_recovery(id,id,100,0,'TJS',current_date,'ROLLBACK-ONLY',null,'',greatest(revision,1));raise exception 'Reason-free administrator recovery accepted';exception when check_violation then checks:=checks+1;end;
 begin perform public.cgf_record_recovery(id,id,100,0,'TJS',current_date,'ROLLBACK-ONLY',null,'Regression authority reason',greatest(revision,1),'unsupported_method');raise exception 'Unsupported method accepted';exception when check_violation then checks:=checks+1;end;
 if revision>0 then
  begin perform public.cgf_record_recovery(id,id,100,0,'TJS',current_date,'ROLLBACK-ONLY',null,'Regression authority reason',revision+1);raise exception 'Stale revision accepted';exception when serialization_failure then checks:=checks+1;end;
 end if;
 execute 'reset role';
 for actor in select distinct on(r.code) p.id,r.code,p.bank_id from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and r.code not in ('super_admin','prsf_admin','accountant') order by r.code,p.id loop
  perform set_config('request.jwt.claim.sub',actor.id::text,true);execute 'set local role authenticated';
  begin perform public.cgf_record_recovery(id,id,100,0,'TJS',current_date,'ROLLBACK-ONLY',null,'Unauthorized recovery attempt',greatest(revision,1));raise exception 'Unauthorized recovery role accepted: %',actor.code;exception when insufficient_privilege then checks:=checks+1;end;
  if actor.bank_id is not null then assert not exists(select 1 from public.recoveries where bank_id is distinct from actor.bank_id),'Bank recovery isolation failed';end if;
  execute 'reset role';
 end loop;
 assert not has_table_privilege('authenticated','public.recoveries','INSERT,UPDATE,DELETE,TRUNCATE'),'Direct recovery write exposed';checks:=checks+1;
 assert not has_function_privilege('anon','public.cgf_record_recovery(uuid,uuid,numeric,numeric,text,date,text,text,text,bigint,text)','EXECUTE'),'Anonymous recovery call exposed';checks:=checks+1;
 assert not has_function_privilege('authenticated','cgf_private.allocate_recovery(jsonb,numeric,numeric,numeric,numeric,numeric)','EXECUTE'),'Internal calculator exposed';checks:=checks+1;
 assert exists(select 1 from pg_trigger where tgrelid='public.recoveries'::regclass and tgname='cgf_recovery_append_only' and tgenabled='O'),'Immutable recovery guard missing';checks:=checks+1;
 assert (select count(*) from public.recoveries)=before_count,'Regression changed recovery records';
 assert (select count(*) from public.audit_trail where table_name='recoveries')=before_audit,'Regression changed recovery audit records';
 raise notice '% recovery allocation, validation, authorization and grant assertions passed; successful receipt/replay/concurrency acceptance remains separate',checks;
end $test$;
rollback;
select 'Recovery calculation and boundary regressions passed without changing business records' as result;
