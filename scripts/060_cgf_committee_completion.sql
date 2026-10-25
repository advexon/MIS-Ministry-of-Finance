begin;

do $$ begin
 if exists(select 1 from public.committee_meetings where status='signing') then raise exception 'Finish existing frozen protocols before installing committee evidence changes'; end if;
end $$;

revoke all on public.committee_meetings, public.committee_meeting_members, public.committee_agenda_items, public.committee_votes from anon;
revoke truncate, references, trigger on public.committee_meetings, public.committee_meeting_members, public.committee_agenda_items, public.committee_votes, public.claim_committee_sittings, public.claim_committee_members, public.claim_committee_votes from authenticated;

create function cgf_private.committee_loan_ready(p_meeting uuid) returns void
language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.committee_agenda_items where meeting_id=p_meeting)
 or exists(select 1 from public.committee_agenda_items i left join public.loan_applications l on l.id=i.loan_id where i.meeting_id=p_meeting and l.status is distinct from 'kkg_review') then
  raise exception 'Return every application from completed verification to committee review before voting or preparing a protocol' using errcode='23514';
 end if;
end $$;
revoke all on function cgf_private.committee_loan_ready(uuid) from public,anon,authenticated;

do $$ declare definition text; original text; begin
 select pg_get_functiondef('public.cgf_committee_action(text,uuid,jsonb)'::regprocedure) into definition;
 original:=definition;
 definition:=replace(definition,'where p.id=actor and p.is_active and r.is_active;','where p.id=actor and p.is_active and r.is_active and p.bank_id is null;');
 definition:=replace(definition,$patch$where p.is_active and r.is_active and p.department='operations'$patch$,$patch$where p.is_active and r.is_active and p.bank_id is null and p.department='operations'$patch$);
 definition:=replace(definition,$patch$where p.is_active and r.is_active and r.code='fkg_management'$patch$,$patch$where p.is_active and r.is_active and p.bank_id is null and r.code='fkg_management'$patch$);
 definition:=replace(definition,$patch$   if l.status='verification'$patch$, $patch$   if l.status='rejected' and not exists(select 1 from public.committee_agenda_items i join public.committee_meetings cm on cm.id=i.meeting_id where i.loan_id=l.id and cm.status='closed' and i.outcome='recommend_reject' and i.decided_at is not null) then raise exception 'Only a prior committee rejection may be reconsidered in a new sitting' using errcode='23514'; end if;
   if l.currency is distinct from 'TJS' or coalesce(l.guarantee_amount,l.approved_amount,0)<=0 or coalesce(l.guarantee_amount,l.approved_amount)::text in ('NaN','Infinity','-Infinity') then raise exception 'A positive finite TJS exposure is required' using errcode='23514'; end if;
   if l.status='verification'$patch$);
 definition:=replace(definition,$patch$   elsif p_action='vote' then$patch$, $patch$   elsif p_action='vote' then
     perform cgf_private.committee_loan_ready(mid);$patch$);
 definition:=replace(definition,$patch$   elsif p_action='prepare' then$patch$, $patch$   elsif p_action='prepare' then
     perform cgf_private.committee_loan_ready(mid);$patch$);
 definition:=replace(definition,$patch$'items',(select jsonb_agg(to_jsonb(a) order by a.id)$patch$,$patch$'items',(select jsonb_agg(to_jsonb(a) || jsonb_build_object('loan_terms',cgf_private.loan_signing_terms(a.loan_id)-array['protocol','compliance']) order by a.id)$patch$);
 definition:=replace(definition,$patch$       if l.status not in ('kkg_review','verification')$patch$, $patch$       if (select x->'loan_terms' from jsonb_array_elements(m.protocol_snapshot->'items') x where x->>'id'=item.id::text) is distinct from (cgf_private.loan_signing_terms(l.id)-array['protocol','compliance']) then raise exception 'Application terms changed or protocol has no frozen terms; issuance refused' using errcode='40001'; end if;
       if l.status not in ('kkg_review','verification')$patch$);
 definition:=replace(definition,$patch$   if p_action='attendance' then$patch$, $patch$   if p_action in ('vote','sign') and not public.cgf_is_super_admin() and not exists(select 1 from public.committee_meeting_members mm join public.profiles p on p.id=mm.member_id where mm.meeting_id=mid and mm.member_id=actor and p.bank_id is null and ((rc='fkg_management') or (p.department='operations' and p.is_loan_committee_member))) then raise exception 'An eligible assigned committee member is required' using errcode='42501'; end if;
   if p_action='attendance' then
     if jsonb_typeof(p_data->'attended') is distinct from 'boolean' then raise exception 'Attendance must be true or false' using errcode='22023'; end if;$patch$);
 definition:=replace(definition,$patch$ perform cgf_private.require_admin_reason(p_data->>'authority_reason');$patch$, $patch$ if jsonb_typeof(p_data) is distinct from 'object' or length(coalesce(p_data->>'notes',''))>4000 then raise exception 'Valid action data and notes of at most 4000 characters required' using errcode='22023'; end if;
 perform cgf_private.require_admin_reason(p_data->>'authority_reason');$patch$);
 if definition=original or position('committee_loan_ready(mid)' in definition)=0 or position($patch$'loan_terms',cgf_private.loan_signing_terms$patch$ in definition)=0 or position('Only a prior committee rejection' in definition)=0 then raise exception 'Unexpected committee function version'; end if;
 execute definition;

 select pg_get_functiondef('cgf_private.guard_pipeline()'::regprocedure) into definition;
 if position($patch$when 'kkg_scheduled' then array['kkg_review','cancelled']$patch$ in definition)=0 then raise exception 'Unexpected pipeline guard version'; end if;
 definition:=replace(definition,$patch$when 'kkg_scheduled' then array['kkg_review','cancelled']$patch$, $patch$when 'rejected' then array['kkg_review'] when 'kkg_scheduled' then array['kkg_review','cancelled']$patch$);
 definition:=replace(definition,$patch$ if old.status='kkg_scheduled' and new.status='kkg_review'$patch$, $patch$ if old.status='rejected' and new.status='kkg_review' and not exists(select 1 from public.committee_agenda_items i join public.committee_meetings m on m.id=i.meeting_id where i.loan_id=new.id and m.status='scheduled' and (m.secretary_id=auth.uid() or public.cgf_is_super_admin())) then raise exception 'Convene a new sitting to reconsider a committee rejection' using errcode='23514'; end if;
 if old.status='kkg_review' and new.status='verification' then
  if not exists(select 1 from public.committee_agenda_items i join public.committee_meetings m on m.id=i.meeting_id where i.loan_id=new.id and m.status in ('scheduled','in_progress')) then raise exception 'A frozen protocol cannot be returned for verification' using errcode='23514'; end if;
  delete from public.committee_votes v using public.committee_agenda_items i,public.committee_meetings m where v.agenda_item_id=i.id and i.loan_id=new.id and m.id=i.meeting_id and m.status in ('scheduled','in_progress');
 end if;
 if old.status='kkg_scheduled' and new.status='kkg_review'$patch$);
 execute definition;
end $$;

create or replace function cgf_private.guard_committee_immutable() returns trigger
language plpgsql set search_path='' as $$
declare mid uuid; state text;
begin
 if tg_table_name='committee_meetings' then
  if old.status in ('closed','protocol_issued','cancelled') then raise exception 'Finalized sittings are immutable; convene a new sitting' using errcode='23514'; end if;
  if old.status='signing' and (tg_op='DELETE' or (to_jsonb(new)-array['status','held_at','updated_at','escalated_at']) is distinct from (to_jsonb(old)-array['status','held_at','updated_at','escalated_at'])) then raise exception 'The protocol is frozen for signatures' using errcode='23514'; end if;
 else
  if tg_table_name='committee_votes' then
   select meeting_id into mid from public.committee_agenda_items where id=case when tg_op='INSERT' then new.agenda_item_id else old.agenda_item_id end;
  else mid:=case when tg_op='INSERT' then new.meeting_id else old.meeting_id end;
  end if;
  select status into state from public.committee_meetings where id=mid for update;
  if state in ('closed','protocol_issued','cancelled') then raise exception 'Finalized sittings are immutable; convene a new sitting' using errcode='23514'; end if;
  if state='signing' and not (tg_table_name='committee_meeting_members' and tg_op='UPDATE' and (to_jsonb(new)-'signed_at')=(to_jsonb(old)-'signed_at') and (to_jsonb(old)->>'signed_at') is null and (to_jsonb(new)->>'signed_at') is not null) then raise exception 'The protocol is frozen for signatures' using errcode='23514'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;

commit;
