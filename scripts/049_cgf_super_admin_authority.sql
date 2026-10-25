begin;

create or replace function public.cgf_is_super_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id
 where p.id=auth.uid() and p.is_active and r.is_active and p.bank_id is null and r.code='super_admin' and r.tier=1)
$$;
revoke all on function public.cgf_is_super_admin() from public,anon;
grant execute on function public.cgf_is_super_admin() to authenticated;

create or replace function cgf_private.require_admin_reason(p_reason text default null) returns void
language plpgsql set search_path='' as $$
begin
 if public.cgf_is_super_admin() then
  if p_reason is not null then perform set_config('cgf.admin_reason',btrim(p_reason),true); end if;
  if length(btrim(coalesce(current_setting('cgf.admin_reason',true),''))) not between 3 and 2000 then
   raise exception 'Explain this Super Administrator authority action (3–2000 characters)' using errcode='23514';
  end if;
 end if;
end $$;
revoke all on function cgf_private.require_admin_reason(text) from public,anon;
grant execute on function cgf_private.require_admin_reason(text) to authenticated;

-- Fail on schema drift instead of silently leaving a conflicting guard in place.
create temporary table authority_definitions(signature text primary key,definition text not null) on commit drop;
create function pg_temp.patch_authority(signature text, old_text text, new_text text) returns void
language plpgsql as $$ declare body text; begin
 select d.definition into body from authority_definitions d where d.signature=patch_authority.signature;
 if body is null then body:=pg_get_functiondef(signature::regprocedure); end if;
 if position(old_text in body)=0 then raise exception 'Authority migration does not match %: %',signature,old_text; end if;
 insert into authority_definitions values(signature,replace(body,old_text,new_text)) on conflict on constraint authority_definitions_pkey do update set definition=excluded.definition;
end $$;
select pg_temp.patch_authority('public.current_user_role_code()',
 'where p.id=auth.uid() and p.is_active and r.is_active',
 'where p.id=auth.uid() and p.is_active and r.is_active and (r.code<>''super_admin'' or (r.tier=1 and p.bank_id is null))');
select pg_temp.patch_authority('public.cgf_guard_admin_decision()',
 'actor not in (''super_admin'',''prsf_admin'')','actor <> ''prsf_admin''');
select pg_temp.patch_authority('public.cgf_has_signing_authority()',
 '(r.code=''fkg_management'' or','(public.cgf_is_super_admin() or r.code=''fkg_management'' or');
select pg_temp.patch_authority('cgf_private.guard_signed_loan_status()',
 'public.current_user_role_code() is distinct from ''fkg_management''',
 '(not public.cgf_is_super_admin() and public.current_user_role_code() is distinct from ''fkg_management'')');
select pg_temp.patch_authority('public.cgf_transition_loan(uuid,text,text,text,jsonb,jsonb)',
 'if rc is null or rc in (''super_admin'',''prsf_admin'',''auditor'')',
 'perform cgf_private.require_admin_reason(p_reason); if rc is null or rc in (''prsf_admin'',''auditor'')');
select pg_temp.patch_authority('public.cgf_transition_loan(uuid,text,text,text,jsonb,jsonb)',
 'if rc not in (''prsf_analyst'',''compliance_officer'')',
 'if not public.cgf_is_super_admin() and rc not in (''prsf_analyst'',''compliance_officer'')');
select pg_temp.patch_authority('cgf_private.guard_pipeline()',
 'if rc is null or rc not in (''bank_admin'',''bank_officer'') or actor_bank is distinct from new.bank_id then',
 'if not public.cgf_is_super_admin() and (rc is null or rc not in (''bank_admin'',''bank_officer'') or actor_bank is distinct from new.bank_id) then');
select pg_temp.patch_authority('cgf_private.guard_pipeline()',
 'if old.status in (''draft'',''docs_incomplete'') and (rc is null',
 'if not public.cgf_is_super_admin() and old.status in (''draft'',''docs_incomplete'') and (rc is null');
select pg_temp.patch_authority('cgf_private.guard_pipeline()',
 'if rc is null or rc in (''super_admin'',''prsf_admin'',''auditor'')',
 'if rc is null or rc in (''prsf_admin'',''auditor'')');
select pg_temp.patch_authority('cgf_private.guard_pipeline()',
 'if old.status in (''draft'',''docs_incomplete'') then
  if rc not in',
 'if not public.cgf_is_super_admin() then
 if old.status in (''draft'',''docs_incomplete'') then
  if rc not in');
select pg_temp.patch_authority('cgf_private.guard_pipeline()',
 'if old.status not in (''draft'',''docs_incomplete'') and (new.approved_amount',
 'end if;
 if public.cgf_is_super_admin() then perform cgf_private.require_admin_reason(); end if;
 if old.status not in (''draft'',''docs_incomplete'') and (new.approved_amount');
select pg_temp.patch_authority('cgf_private.guard_pipeline()',
 'm.secretary_id=auth.uid() and m.status=''cancelled''',
 '(m.secretary_id=auth.uid() or public.cgf_is_super_admin()) and m.status=''cancelled''');
select pg_temp.patch_authority('cgf_private.guard_pipeline_artifact()',
 'if (tg_table_name in (''assessment_notes''',
 'if not public.cgf_is_super_admin() and ((tg_table_name in (''assessment_notes''');
select pg_temp.patch_authority('cgf_private.guard_pipeline_artifact()',
 'then raise exception ''Wrong artifact authority''',
 ') then raise exception ''Wrong artifact authority''');
select pg_temp.patch_authority('cgf_private.guard_pipeline_artifact()',
 'if tg_table_name=''verifications'' and exists',
 'if not public.cgf_is_super_admin() and tg_table_name=''verifications'' and exists');
select pg_temp.patch_authority('cgf_private.guard_pipeline_artifact()',
 'if tg_table_name in (''assessment_notes'',''formal_applications'',''uko_reconciliations'') and',
 'if not public.cgf_is_super_admin() and tg_table_name in (''assessment_notes'',''formal_applications'',''uko_reconciliations'') and');
select pg_temp.patch_authority('public.cgf_confirm_deputy(uuid,text)',
 'if public.current_user_role_code() is distinct from ''deputy_director''',
 'perform cgf_private.require_admin_reason(p_notes); if not public.cgf_is_super_admin() and public.current_user_role_code() is distinct from ''deputy_director''');
select pg_temp.patch_authority('public.cgf_issue_guarantee(uuid)',
 'if not public.cgf_has_signing_authority()',
 'perform cgf_private.require_admin_reason(); if not public.cgf_has_signing_authority()');
select pg_temp.patch_authority('public.cgf_issue_guarantee(uuid)',
 'if confirmation.confirmed_by=actor then',
 'if confirmation.confirmed_by=actor and not public.cgf_is_super_admin() then');
select pg_temp.patch_authority('public.cgf_issue_guarantee(uuid)',
 'and r.code=''fkg_management'')',
 'and (r.code=''fkg_management'' or (r.code=''super_admin'' and r.tier=1)))');

-- Committee authority never creates another person's vote or signature.
select pg_temp.patch_authority('public.cgf_committee_action(text,uuid,jsonb)',
 'if actor is null or rc is null or rc not in',
 'perform cgf_private.require_admin_reason(p_data->>''authority_reason''); if not public.cgf_is_super_admin() and (actor is null or rc is null or rc not in');
select pg_temp.patch_authority('public.cgf_committee_action(text,uuid,jsonb)',
 'then raise exception ''Active operational committee authority required''',
 ') then raise exception ''Active operational committee authority required''');
select pg_temp.patch_authority('public.cgf_committee_action(text,uuid,jsonb)',
 'if not coalesce(secretary,false) then',
 'if not public.cgf_is_super_admin() and not coalesce(secretary,false) then');
select pg_temp.patch_authority('public.cgf_committee_action(text,uuid,jsonb)',
 'and (not coalesce(secretary,false) or m.secretary_id<>actor) then',
 'and not public.cgf_is_super_admin() and (not coalesce(secretary,false) or m.secretary_id<>actor) then');
select pg_temp.patch_authority('public.cgf_claim_committee_action(text,uuid,jsonb)',
 'if actor is null or rc is null or rc not in',
 'perform cgf_private.require_admin_reason(p_data->>''authority_reason''); if not public.cgf_is_super_admin() and (actor is null or rc is null or rc not in');
select pg_temp.patch_authority('public.cgf_claim_committee_action(text,uuid,jsonb)',
 'then raise exception ''Active operational committee authority required''',
 ') then raise exception ''Active operational committee authority required''');
select pg_temp.patch_authority('public.cgf_claim_committee_action(text,uuid,jsonb)',
 'if not coalesce(secretary,false) or rc=''fkg_management'' then',
 'if not public.cgf_is_super_admin() and (not coalesce(secretary,false) or rc=''fkg_management'') then');
select pg_temp.patch_authority('public.cgf_claim_committee_action(text,uuid,jsonb)',
 'and (not coalesce(secretary,false) or s.secretary_id<>actor or rc=''fkg_management'') then',
 'and not public.cgf_is_super_admin() and (not coalesce(secretary,false) or s.secretary_id<>actor or rc=''fkg_management'') then');
select pg_temp.patch_authority('public.cgf_request_clarification(uuid,text)',
 'if not found or m.secretary_id is distinct from auth.uid() or not exists',
 'perform cgf_private.require_admin_reason(p_reason); if m.id is null or (not public.cgf_is_super_admin() and (m.secretary_id is distinct from auth.uid() or not exists');
select pg_temp.patch_authority('public.cgf_request_clarification(uuid,text)',
 'then raise exception ''Assigned secretary required before protocol signing''',
 ')) then raise exception ''Assigned secretary required before protocol signing''');

do $$ declare d record; begin for d in select definition from authority_definitions loop execute d.definition; end loop; end $$;

alter policy cgf_bank_insert_scope on public.loan_applications with check (public.cgf_is_super_admin() or (bank_id=public.current_user_bank_id() and public.current_user_role_code() in ('bank_admin','bank_officer')));
alter policy management_decisions_insert on public.management_decisions with check ((public.cgf_is_super_admin() or public.current_user_role_code()='fkg_management') and decided_by=auth.uid() and public.cgf_deputy_confirmation_current(loan_id) and exists(select 1 from public.loan_applications l where l.id=management_decisions.loan_id and l.status='management_review'));

create function public.cgf_sign_guarantee(p_loan uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$ declare result jsonb; begin
 if auth.uid() is null or public.current_user_role_code() is null then raise exception 'Active employee required' using errcode='42501'; end if;
 perform cgf_private.require_admin_reason(p_reason);
 result:=public.cgf_issue_guarantee(p_loan);
 if public.cgf_is_super_admin() then insert into public.audit_trail(table_name,record_id,action,changed_by,new_data) values('loan_applications',p_loan,'SUPER_ADMIN_SIGNATURE_AUTHORITY',auth.uid(),jsonb_build_object('reason',p_reason,'result',result)); end if;
 return result;
end $$;
revoke all on function public.cgf_sign_guarantee(uuid,text) from public,anon;
grant execute on function public.cgf_sign_guarantee(uuid,text) to authenticated;

create function cgf_private.audit_super_admin_evidence() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if public.cgf_is_super_admin() then
  perform cgf_private.require_admin_reason(new.authority_reason);
  insert into public.audit_trail(table_name,record_id,action,changed_by,old_data,new_data)
  values(tg_table_name,new.id,'SUPER_ADMIN_EVIDENCE_AUTHORITY',auth.uid(),case when tg_op='UPDATE' then jsonb_build_object('id',old.id,'loan_id',old.loan_id) end,jsonb_build_object('id',new.id,'loan_id',new.loan_id,'reason',current_setting('cgf.admin_reason',true)));
 end if;
 return new;
end $$;
revoke all on function cgf_private.audit_super_admin_evidence() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['assessment_notes','risk_reviews','verifications','formal_applications','uko_reconciliations','compliance_checks','eligibility_checks','management_decisions'] loop
  execute format('alter table public.%I add column authority_reason text check (authority_reason is null or length(btrim(authority_reason)) between 3 and 2000)',t);
  execute format('create trigger cgf_super_admin_evidence after insert or update on public.%I for each row execute function cgf_private.audit_super_admin_evidence()',t);
 end loop;
end $$;

create function cgf_private.protect_last_super_admin() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 perform pg_advisory_xact_lock(474706392);
 if tg_table_name='profiles' then
 if old.is_active and exists(select 1 from public.roles where id=old.role_id and code='super_admin' and tier=1 and is_active) and
 (tg_op='DELETE' or new.is_active is not true or new.role_id is distinct from old.role_id or new.bank_id is not null) and
 not exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id<>old.id and p.is_active and p.bank_id is null and r.is_active and r.code='super_admin' and r.tier=1) then
  raise exception 'The final active Super Administrator cannot be disabled, demoted, bank-scoped or deleted' using errcode='23514';
 end if;
 end if;
 if tg_table_name='roles' then
 if old.code='super_admin' and (tg_op='DELETE' or new.is_active is not true or new.code<>'super_admin' or new.tier<>1) then
  raise exception 'The built-in Super Administrator role cannot be disabled or changed' using errcode='23514';
 end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function cgf_private.protect_last_super_admin() from public,anon,authenticated;
create trigger cgf_last_super_admin before update or delete on public.profiles for each row execute function cgf_private.protect_last_super_admin();
create trigger cgf_super_admin_role before update or delete on public.roles for each row execute function cgf_private.protect_last_super_admin();

commit;
