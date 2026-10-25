begin;

create function public.cgf_save_settings(p_changes jsonb,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare change jsonb; previous public.system_settings%rowtype; item_key text; item_value text; numeric_value numeric;
begin
 if auth.uid() is null or coalesce(public.current_user_role_code(),'') not in ('super_admin','prsf_admin') then raise exception 'Active administrator required' using errcode='42501'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 3 and 2000 or jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 30 then raise exception 'Provide settings and a change reason' using errcode='23514'; end if;
 if (select count(distinct x->>'key') from jsonb_array_elements(p_changes) x)<>jsonb_array_length(p_changes) then raise exception 'Duplicate setting keys' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(474706393);
 for change in select value from jsonb_array_elements(p_changes) loop
  item_key:=change->>'key'; item_value:=change->>'value';
  if item_key is null or item_value is null or not (change ? 'expected_value') then raise exception 'Setting key, value and expected value required' using errcode='23514'; end if;
  select * into previous from public.system_settings where key=item_key for update;
  if previous.value is distinct from (change->>'expected_value') then raise exception 'Settings changed; reload before saving %',item_key using errcode='40001'; end if;
  if item_key in ('direct_officer_submission','notify_loan_submitted','notify_loan_reviewed','notify_claim_submitted') then
   if item_value not in ('true','false') then raise exception 'Boolean setting required' using errcode='23514'; end if;
  elsif item_key in ('committee_operations_members','committee_director_threshold_tjs','pipeline_max_guarantee_tjs','risk_review_threshold_usd','assessment_sla_days','committee_voting_days') then
   if item_value !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Finite nonnegative numeric setting required' using errcode='23514'; end if;
   numeric_value:=item_value::numeric;
   if numeric_value>1000000000000 or (item_key='committee_operations_members' and numeric_value not in (2,3)) or (item_key='committee_director_threshold_tjs' and numeric_value<=0) or (item_key in ('assessment_sla_days','committee_voting_days') and (numeric_value<>trunc(numeric_value) or numeric_value not between 1 and 30)) then raise exception 'Setting is outside the supported range' using errcode='23514'; end if;
  else raise exception 'This setting has no supported runtime consumer' using errcode='23514'; end if;
  insert into public.system_settings(key,value,updated_by) values(item_key,item_value,auth.uid()) on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by;
  insert into public.audit_trail(table_name,record_id,action,changed_by,old_data,new_data)
  select 'system_settings',id,'CONFIGURATION_CHANGED',auth.uid(),jsonb_build_object('value',previous.value),jsonb_build_object('key',item_key,'value',item_value,'reason',btrim(p_reason)) from public.system_settings where key=item_key;
 end loop;
end $$;
revoke all on function public.cgf_save_settings(jsonb,text) from public,anon;
grant execute on function public.cgf_save_settings(jsonb,text) to authenticated;
revoke insert,update,delete on public.system_settings from authenticated;

create function cgf_private.numeric_setting(p_key text,p_default numeric) returns numeric
language sql stable security definer set search_path='' as $$ select coalesce((select value::numeric from public.system_settings where key=p_key),p_default) $$;
revoke all on function cgf_private.numeric_setting(text,numeric) from public,anon,authenticated;
create function cgf_private.working_deadline(p_start timestamptz) returns timestamptz
language plpgsql stable security definer set search_path='' as $$ declare result timestamptz:=p_start; days integer:=cgf_private.numeric_setting('committee_voting_days',1)::integer; begin
 for i in 1..days loop result:=cgf_private.next_working_day(result); end loop; return result;
end $$;
revoke all on function cgf_private.working_deadline(timestamptz) from public,anon,authenticated;

do $$ declare definition text; begin
 select pg_get_functiondef('cgf_private.guard_pipeline()'::regprocedure) into definition;
 if position('new.amount_usd>=10000' in definition)=0 then raise exception 'Risk guard changed'; end if;
 execute replace(definition,'new.amount_usd>=10000','new.amount_usd>=cgf_private.numeric_setting(''risk_review_threshold_usd'',10000)');
 select pg_get_functiondef('public.cgf_committee_action(text,uuid,jsonb)'::regprocedure) into definition;
 if position('cgf_private.next_working_day(now())' in definition)=0 then raise exception 'Committee deadline changed'; end if;
 execute replace(definition,'cgf_private.next_working_day(now())','cgf_private.working_deadline(now())');
 select pg_get_functiondef('cgf_private.guard_pipeline_artifact()'::regprocedure) into definition;
 execute replace(definition,'actor_col:=case tg_table_name','if tg_table_name=''assessment_notes'' then new.due_at:=now()+cgf_private.numeric_setting(''assessment_sla_days'',1)*interval ''1 day''; end if; actor_col:=case tg_table_name');
 select pg_get_functiondef('cgf_private.claim_submission_events()'::regprocedure) into definition;
 if position('actor_role IN (''super_admin'', ''prsf_admin'', ''auditor'')' in definition)=0 then raise exception 'Claim submission authority changed'; end if;
 execute replace(definition,'actor_role IN (''super_admin'', ''prsf_admin'', ''auditor'')','actor_role IN (''prsf_admin'', ''auditor'')');
 select pg_get_functiondef('public.cgf_claim_committee_action(text,uuid,jsonb)'::regprocedure) into definition;
 if position('cm.role_code=rc and (p.is_claims_committee_member or rc=''fkg_management'')' in definition)=0 then raise exception 'Claims member guard changed'; end if;
 execute replace(definition,'cm.role_code=rc and (p.is_claims_committee_member or rc=''fkg_management'')','(public.cgf_is_super_admin() or (cm.role_code=rc and (p.is_claims_committee_member or rc=''fkg_management'')))');
end $$;

create function public.cgf_assume_committee_seat(p_claim boolean,p_sitting uuid,p_member uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare previous jsonb; updated jsonb; state text;
begin
 if not public.cgf_is_super_admin() then raise exception 'Verified Super Administrator required' using errcode='42501'; end if;
 perform cgf_private.require_admin_reason(p_reason);
 if p_claim then
  select status into state from public.claim_committee_sittings where id=p_sitting for update;
  if state is distinct from 'scheduled' or exists(select 1 from public.claim_committee_votes where sitting_id=p_sitting) or exists(select 1 from public.claim_committee_members where sitting_id=p_sitting and (member_id=auth.uid() or signed_at is not null)) then raise exception 'Take one seat before any voting or signature; existing votes cannot be replaced' using errcode='23514'; end if;
  select to_jsonb(m) into previous from public.claim_committee_members m where sitting_id=p_sitting and member_id=p_member;
  update public.claim_committee_members set member_id=auth.uid(),attended=false where sitting_id=p_sitting and member_id=p_member returning to_jsonb(claim_committee_members) into updated;
 else
  select status into state from public.committee_meetings where id=p_sitting for update;
  if state is distinct from 'scheduled' or exists(select 1 from public.committee_votes v join public.committee_agenda_items i on i.id=v.agenda_item_id where i.meeting_id=p_sitting) or exists(select 1 from public.committee_meeting_members where meeting_id=p_sitting and (member_id=auth.uid() or signed_at is not null)) then raise exception 'Take one seat before any voting or signature; existing votes cannot be replaced' using errcode='23514'; end if;
  select to_jsonb(m) into previous from public.committee_meeting_members m where meeting_id=p_sitting and member_id=p_member;
  update public.committee_meeting_members set member_id=auth.uid(),attended=false where meeting_id=p_sitting and member_id=p_member returning to_jsonb(committee_meeting_members) into updated;
  update public.committee_meetings set chaired_by=auth.uid() where id=p_sitting and chaired_by=p_member;
 end if;
 if updated is null then raise exception 'Assigned seat not found' using errcode='23514'; end if;
 insert into public.audit_trail(table_name,record_id,action,changed_by,old_data,new_data) values(case when p_claim then 'claim_committee_sittings' else 'committee_meetings' end,p_sitting,'SUPER_ADMIN_SEAT_SUBSTITUTION',auth.uid(),previous,jsonb_build_object('seat',updated,'reason',btrim(p_reason),'represented_slot',previous->>'role_code'));
end $$;
revoke all on function public.cgf_assume_committee_seat(boolean,uuid,uuid,text) from public,anon;
grant execute on function public.cgf_assume_committee_seat(boolean,uuid,uuid,text) to authenticated;

create function cgf_private.filter_operational_notification() returns trigger
language plpgsql security definer set search_path='' as $$ declare setting_key text; enabled boolean; begin
 setting_key:=case when new.title='Application assigned' then 'notify_loan_submitted' when new.title in ('Guarantee application rejected','Application status updated','Signed guarantee letter available') then 'notify_loan_reviewed' when new.title='Guarantee claim submitted' then 'notify_claim_submitted' end;
 if setting_key is not null then select value='true' into enabled from public.system_settings where key=setting_key; if enabled=false then return null; end if; end if;
 return new;
end $$;
revoke all on function cgf_private.filter_operational_notification() from public,anon,authenticated;
create trigger cgf_notification_preferences before insert on public.notifications for each row execute function cgf_private.filter_operational_notification();

commit;
