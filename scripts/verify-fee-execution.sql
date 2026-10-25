begin;
set local statement_timeout='20s';

do $$
declare rule jsonb:='{"upfront_rate_percent":0.5,"recurring_rate_percent":0.5,"recurring_rate_basis":"quarterly","proration":"none","rounding":"half_up","decimal_places":4}';result jsonb;member record;approved_actor boolean;
begin
  result:=cgf_private.calculate_fee(rule,1000,'upfront',null,null);
  if (result->>'amount')::numeric<>5 then raise exception 'Upfront calculation failed';end if;
  if (cgf_private.calculate_fee(rule,1,'upfront',null,null)->>'amount')::numeric<>0.005 then raise exception 'Four-place storage precision failed';end if;
  if (cgf_private.calculate_fee(jsonb_set(rule,'{decimal_places}','2'),1,'upfront',null,null)->>'amount')::numeric<>0.01 then raise exception 'Half-up tie rounding failed';end if;
  if (cgf_private.calculate_fee(rule,1000,'quarterly','2026-07-01','2026-10-01')->>'amount')::numeric<>5 then raise exception 'Quarterly unprorated calculation failed';end if;
  rule:=rule||'{"recurring_rate_percent":2,"recurring_rate_basis":"annual","proration":"actual_actual"}';
  if (cgf_private.calculate_fee(rule,10000,'quarterly','2024-01-01','2024-04-01')->>'amount')::numeric<>49.7268 then raise exception 'Leap-year Actual/Actual failed';end if;
  if (cgf_private.calculate_fee(rule,10000,'quarterly','2023-12-31','2024-01-02')->>'amount')::numeric<>1.0944 then raise exception 'Year-split Actual/Actual failed';end if;
  rule:=rule||'{"proration":"actual_365"}';
  if (cgf_private.calculate_fee(rule,10000,'quarterly','2024-01-01','2024-04-01')->>'amount')::numeric<>49.8630 then raise exception 'Actual/365 failed';end if;
  rule:=rule||'{"recurring_rate_percent":0.5,"recurring_rate_basis":"quarterly"}';
  if (cgf_private.calculate_fee(rule,10000,'quarterly','2024-01-01','2024-04-01')->>'amount')::numeric<>49.8630 then raise exception 'Quarterly annualization failed';end if;
  if (cgf_private.calculate_fee(rule,0,'quarterly','2024-01-01','2024-04-01')->>'amount')::numeric<>0 then raise exception 'Zero outstanding principal must remain zero';end if;
  begin perform cgf_private.calculate_fee(rule,-1,'upfront',null,null);raise exception 'Negative base accepted';exception when check_violation then null;end;
  begin perform cgf_private.calculate_fee(rule,'NaN','upfront',null,null);raise exception 'NaN base accepted';exception when check_violation then null;end;
  begin perform cgf_private.calculate_fee(rule,1,'quarterly','2026-10-01','2026-10-01');raise exception 'Empty period accepted';exception when check_violation then null;end;
  if has_table_privilege('authenticated','public.fees','INSERT') or has_table_privilege('authenticated','public.fees','UPDATE') or has_table_privilege('authenticated','public.fees','DELETE') or has_table_privilege('authenticated','public.fees','TRUNCATE') then raise exception 'Direct fee mutation grant remains';end if;
  if has_function_privilege('anon','public.cgf_create_fee(uuid,uuid,text,date,date,date,uuid,text,bigint)','EXECUTE') or has_function_privilege('anon','public.cgf_fee_action(uuid,text,date,text,text)','EXECUTE') then raise exception 'Anonymous fee RPC execution remains';end if;
  for member in select distinct on(r.code) p.id,r.code from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active order by r.code,p.id loop
    perform set_config('request.jwt.claim.sub',member.id::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
    approved_actor:=member.code in ('super_admin','prsf_admin','accountant') and exists(select 1 from public.profiles where id=member.id and bank_id is null);
    begin
      perform public.cgf_create_fee(gen_random_uuid(),gen_random_uuid(),'upfront',current_date,null,null,null,'rollback fee boundary verification',1);
      raise exception 'Missing-policy create unexpectedly succeeded';
    exception
      when insufficient_privilege then if approved_actor then raise exception 'Fee authority rejected for %',member.code;end if;
      when check_violation or serialization_failure then if not approved_actor then raise exception 'Unauthorized role reached fee prerequisites: %',member.code;end if;
    end;
    begin
      perform public.cgf_fee_action(gen_random_uuid(),'invoice',current_date,null,'rollback fee boundary verification');
      raise exception 'Missing-fee action unexpectedly succeeded';
    exception
      when insufficient_privilege then if approved_actor then raise exception 'Fee action authority rejected for %',member.code;end if;
      when check_violation then if not approved_actor then raise exception 'Unauthorized role reached action prerequisites: %',member.code;end if;
    end;
  end loop;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.cgf_create_fee(gen_random_uuid(),gen_random_uuid(),'upfront',current_date,null,null,null,'missing identity probe',1);raise exception 'Missing actor accepted';exception when insufficient_privilege then null;end;
end $$;
rollback;
