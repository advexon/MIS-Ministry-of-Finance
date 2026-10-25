begin;
do $$ declare definition text; begin
 select pg_get_functiondef('public.cgf_record_recovery(uuid,uuid,numeric,numeric,text,date,text,text,text,bigint)'::regprocedure) into definition;
 if position('p_expected_revision bigint)' in definition)=0 then raise exception 'Recovery signature changed'; end if;
 definition:=replace(definition,'p_expected_revision bigint)','p_expected_revision bigint, p_method text DEFAULT ''other''::text)');
 definition:=replace(definition,'perform cgf_private.require_admin_reason(p_notes);','if p_method is null or p_method not in (''cash'',''collateral_sale'',''court_order'',''voluntary'',''insurance'',''other'') then raise exception ''Unsupported recovery method'' using errcode=''23514''; end if; perform cgf_private.require_admin_reason(p_notes);');
 definition:=replace(definition,'''claim_id'',p_claim_id,''gross''','''method'',p_method,''claim_id'',p_claim_id,''gross''');
 definition:=replace(definition,'recovery_amount,total_recovered,recovery_date,','recovery_amount,total_recovered,recovery_method,recovery_date,');
 definition:=replace(definition,'p_currency,p_gross,p_gross,p_date,','p_currency,p_gross,p_gross,p_method,p_date,');
 execute definition;
end $$;
drop function public.cgf_record_recovery(uuid,uuid,numeric,numeric,text,date,text,text,text,bigint);
revoke all on function public.cgf_record_recovery(uuid,uuid,numeric,numeric,text,date,text,text,text,bigint,text) from public,anon;
grant execute on function public.cgf_record_recovery(uuid,uuid,numeric,numeric,text,date,text,text,text,bigint,text) to authenticated;
commit;
