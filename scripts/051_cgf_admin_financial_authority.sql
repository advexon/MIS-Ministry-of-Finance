begin;

alter table public.claim_payments drop constraint claim_payments_recorded_role_check;
alter table public.claim_payments add constraint claim_payments_recorded_role_check check(recorded_role in ('super_admin','accountant','deputy_director','fkg_management'));
do $$ declare definition text; begin
 select pg_get_functiondef('public.cgf_record_claim_payment(uuid,uuid,numeric,text,date,text,text,bigint)'::regprocedure) into definition;
 if position('rc not in (''accountant'',''deputy_director'',''fkg_management'')' in definition)=0 then raise exception 'Payment authority changed'; end if;
 definition:=replace(definition,'rc not in (''accountant'',''deputy_director'',''fkg_management'')','(rc not in (''accountant'',''deputy_director'',''fkg_management'') and not public.cgf_is_super_admin())');
 definition:=replace(definition,'perform pg_advisory_xact_lock(474706391);','perform cgf_private.require_admin_reason(p_notes); perform pg_advisory_xact_lock(474706391);');
 definition:=replace(definition,'if authority is null or not (policy.policy->''currencies'' ? p_currency)', 'if public.cgf_is_super_admin() then authority:=jsonb_build_object(''per_payment_limit'',1000000000000,''per_claim_limit'',1000000000000); end if; if authority is null or not (policy.policy->''currencies'' ? p_currency)');
 definition:=replace(definition,'if (policy.policy#>>''{claims,separate_payment_actor}'')::boolean and (','if not public.cgf_is_super_admin() and (policy.policy#>>''{claims,separate_payment_actor}'')::boolean and (');
 execute definition;
end $$;

create function public.cgf_set_sector_prohibited(p_sector uuid,p_expected boolean,p_prohibited boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$ declare previous boolean; begin
 if auth.uid() is null or coalesce(public.current_user_role_code(),'') not in ('super_admin','prsf_admin') then raise exception 'Active administrator required' using errcode='42501'; end if;
 if p_prohibited is null or p_reason is null or length(btrim(p_reason)) not between 3 and 2000 then raise exception 'Screening value and change reason required' using errcode='23514'; end if;
 select is_prohibited into previous from public.sectors where id=p_sector for update;
 if not found then raise exception 'Sector not found' using errcode='23514'; end if;
 if previous is distinct from p_expected then raise exception 'Sector changed; reload before saving' using errcode='40001'; end if;
 update public.sectors set is_prohibited=p_prohibited where id=p_sector;
 insert into public.audit_trail(table_name,record_id,action,changed_by,old_data,new_data) values('sectors',p_sector,'SECTOR_SCREENING_CHANGED',auth.uid(),jsonb_build_object('is_prohibited',previous),jsonb_build_object('is_prohibited',p_prohibited,'reason',btrim(p_reason)));
end $$;
revoke all on function public.cgf_set_sector_prohibited(uuid,boolean,boolean,text) from public,anon;
grant execute on function public.cgf_set_sector_prohibited(uuid,boolean,boolean,text) to authenticated;

create function cgf_private.notify_claim_created() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 insert into public.notifications(user_id,title,message,type,link)
 select p.id,'Guarantee claim submitted','A new guarantee claim awaits committee review.','info','/dashboard/claims'
 from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and p.bank_id is null and r.code in ('super_admin','prsf_admin','prsf_analyst','credit_risk_officer','compliance_officer');
 return new;
end $$;
revoke all on function cgf_private.notify_claim_created() from public,anon,authenticated;
create trigger cgf_notify_claim_created after insert on public.claims for each row execute function cgf_private.notify_claim_created();

commit;
