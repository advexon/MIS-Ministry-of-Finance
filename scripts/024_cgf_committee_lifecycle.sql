alter table public.committee_meetings drop constraint committee_meetings_status_check;
alter table public.committee_meetings add constraint committee_meetings_status_check check (status in ('scheduled','in_progress','held','protocol_issued','cancelled','closed','signing'));
alter table public.committee_meetings add column due_at timestamptz, add column escalated_at timestamptz, add column protocol_snapshot jsonb;
alter table public.committee_meeting_members add column signed_at timestamptz;
insert into public.system_settings(key,value,description) values ('committee_operations_members','3','Number of operations members: 2 or 3'),('committee_director_threshold_tjs','1000000','Director joins above this TJS exposure; independent from the USD assessment threshold') on conflict(key) do nothing;

create schema if not exists cgf_private;
revoke all on schema cgf_private from public,anon,authenticated;

create function cgf_private.next_working_day(t timestamptz) returns timestamptz language plpgsql immutable set search_path='' as $$
declare d timestamp := (t at time zone 'Asia/Dushanbe') + interval '1 day';
begin while extract(isodow from d)>5 loop d:=d+interval '1 day'; end loop; return d at time zone 'Asia/Dushanbe'; end $$;

create function cgf_private.guard_committee_immutable() returns trigger language plpgsql set search_path='' as $$
declare mid uuid; s text;
begin
 if tg_table_name='committee_meetings' then
   if old.status in ('closed','protocol_issued','cancelled') then raise exception 'Finalized sittings are immutable; convene a new sitting' using errcode='23514'; end if;
 else
   if tg_table_name='committee_votes' then select meeting_id into mid from public.committee_agenda_items where id=case when tg_op='INSERT' then new.agenda_item_id else old.agenda_item_id end;
   else mid:=case when tg_op='INSERT' then new.meeting_id else old.meeting_id end; end if;
   select status into s from public.committee_meetings where id=mid for update;
   if s in ('closed','protocol_issued','cancelled') then raise exception 'Finalized sittings are immutable; convene a new sitting' using errcode='23514'; end if;
   if s='signing' and not (tg_table_name='committee_meeting_members' and tg_op='UPDATE' and (to_jsonb(new)-'signed_at')=(to_jsonb(old)-'signed_at') and old.signed_at is null and new.signed_at is not null) then raise exception 'The protocol is frozen for signatures' using errcode='23514'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger cgf_immutable_meeting before update or delete on public.committee_meetings for each row execute function cgf_private.guard_committee_immutable();
create trigger cgf_immutable_members before insert or update or delete on public.committee_meeting_members for each row execute function cgf_private.guard_committee_immutable();
create trigger cgf_immutable_agenda before insert or update or delete on public.committee_agenda_items for each row execute function cgf_private.guard_committee_immutable();
create trigger cgf_immutable_votes before insert or update or delete on public.committee_votes for each row execute function cgf_private.guard_committee_immutable();

create function public.cgf_committee_action(p_action text,p_meeting uuid default null,p_data jsonb default '{}'::jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); rc text; secretary boolean; m public.committee_meetings%rowtype; l public.loan_applications%rowtype; item public.committee_agenda_items%rowtype; mid uuid; target uuid; cnt int; expected int; threshold numeric; chair uuid; unanimous_for boolean; unanimous_against boolean; nxt text; affected int; snapshot jsonb;
begin
 select r.code,p.is_committee_secretary and r.code in ('prsf_analyst','credit_risk_officer','compliance_officer') into rc,secretary from public.profiles p join public.roles r on r.id=p.role_id where p.id=actor and p.is_active and r.is_active;
 if actor is null or rc is null or rc in ('super_admin','prsf_admin','auditor','bank_admin','bank_officer','legal_officer','accountant','reporting_officer','business_development','deputy_director') then raise exception 'Active operational committee authority required' using errcode='42501'; end if;
 if p_action='create' then
   if not coalesce(secretary,false) then raise exception 'Secretary flag required' using errcode='42501'; end if;
   if length(trim(coalesce(p_data->>'meeting_no','')))=0 or length(p_data->>'meeting_no')>100 then raise exception 'A meeting number is required' using errcode='22023'; end if;
   select * into l from public.loan_applications where id=(p_data->>'loan_id')::uuid for update;
   if not found or l.status not in ('kkg_scheduled','kkg_review','verification','rejected') then raise exception 'Application is not awaiting a committee sitting' using errcode='23514'; end if;
   if l.status='verification' and not exists(select 1 from public.verifications where loan_id=l.id and status='completed' and outcome<>'not_confirmed') then raise exception 'Complete verification first' using errcode='23514'; end if;
   if exists(select 1 from public.committee_agenda_items a join public.committee_meetings x on x.id=a.meeting_id where a.loan_id=l.id and x.status not in ('closed','protocol_issued','cancelled')) then raise exception 'An open sitting already exists for this application' using errcode='23514'; end if;
   select value::int into expected from public.system_settings where key='committee_operations_members';
   select value::numeric into threshold from public.system_settings where key='committee_director_threshold_tjs';
   if expected not in (2,3) or expected is null or threshold is null or threshold<=0 then raise exception 'Committee settings must be configured' using errcode='23514'; end if;
   if coalesce(l.guarantee_amount,l.approved_amount) is null then raise exception 'Application exposure is unknown' using errcode='23514'; end if;
   insert into public.committee_meetings(meeting_no,scheduled_at,secretary_id,required_quorum,status,due_at) values(trim(p_data->>'meeting_no'),now(),actor,expected,'scheduled',cgf_private.next_working_day(now())) returning id into mid;
   insert into public.committee_meeting_members(meeting_id,member_id,attended,is_chair)
   select mid,p.id,false,false from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and p.department='operations' and p.is_loan_committee_member and r.code in ('prsf_analyst','credit_risk_officer','compliance_officer') order by (select count(*) from public.committee_meeting_members mm join public.committee_meetings cm on cm.id=mm.meeting_id where mm.member_id=p.id and cm.status not in ('closed','protocol_issued','cancelled')),p.created_at,p.id limit expected;
   get diagnostics cnt=row_count;
   if cnt<>expected then raise exception 'Not enough active flagged operations members' using errcode='23514'; end if;
   if coalesce(l.guarantee_amount,l.approved_amount)>threshold then
     select p.id into target from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and r.code='fkg_management' order by p.created_at,p.id limit 1;
     if target is null then raise exception 'An active Director is required above the threshold' using errcode='23514'; end if;
     insert into public.committee_meeting_members(meeting_id,member_id,attended,is_chair) values(mid,target,false,false);
     expected:=expected+1;
   end if;
   select p.id into chair from public.committee_meeting_members mm join public.profiles p on p.id=mm.member_id join public.roles r on r.id=p.role_id where mm.meeting_id=mid order by case when r.code='fkg_management' then 0 when p.is_department_head then 1 when p.specialist_level='chief_specialist' then 2 else 3 end,p.created_at,p.id limit 1;
   update public.committee_meeting_members set is_chair=true where meeting_id=mid and member_id=chair;
   update public.committee_meetings set chaired_by=chair,required_quorum=expected where id=mid;
   insert into public.committee_agenda_items(meeting_id,loan_id) values(mid,l.id);
   update public.loan_applications set status='kkg_review',current_step=8 where id=l.id;
   insert into public.loan_application_history(loan_id,action,old_status,new_status,performed_by,notes) values(l.id,'status_change',l.status,'kkg_review',actor,'System-selected committee: '||(p_data->>'meeting_no'));
 else
   select * into m from public.committee_meetings where id=p_meeting for update;
   if not found then raise exception 'Meeting not found' using errcode='22023'; end if;
   mid:=m.id;
   if m.status in ('closed','protocol_issued','cancelled') then raise exception 'Finalized sittings are immutable; convene a new sitting' using errcode='23514'; end if;
   if p_action in ('attendance','prepare','issue','cancel') and (not coalesce(secretary,false) or m.secretary_id<>actor) then raise exception 'Only the assigned active secretary may perform this action' using errcode='42501'; end if;
   if p_action='attendance' then
     if m.status='signing' then raise exception 'Protocol frozen for signing' using errcode='23514'; end if;
     update public.committee_meeting_members set attended=(p_data->>'attended')::boolean where meeting_id=mid and member_id=(p_data->>'member_id')::uuid;
     get diagnostics affected=row_count;
     if affected<>1 then raise exception 'Member not seated' using errcode='22023'; end if;
   elsif p_action='vote' then
     if m.status='signing' then raise exception 'Protocol frozen for signing' using errcode='23514'; end if;
     if not exists(select 1 from public.committee_meeting_members where meeting_id=mid and member_id=actor and attended) then raise exception 'Only present assigned members may vote' using errcode='42501'; end if;
     if not exists(select 1 from public.committee_agenda_items where meeting_id=mid and id=(p_data->>'item_id')::uuid and decided_at is null) then raise exception 'Agenda item unavailable' using errcode='23514'; end if;
     if p_data->>'vote' not in ('for','against','abstain') or p_data->>'vote' is null then raise exception 'Invalid vote' using errcode='22023'; end if;
     insert into public.committee_votes(agenda_item_id,member_id,vote,voted_at) values((p_data->>'item_id')::uuid,actor,p_data->>'vote',now()) on conflict(agenda_item_id,member_id) do update set vote=excluded.vote,voted_at=excluded.voted_at;
   elsif p_action='prepare' then
     if m.status='signing' then raise exception 'Protocol already frozen' using errcode='23514'; end if;
     if length(trim(coalesce(p_data->>'protocol_no','')))=0 or length(p_data->>'protocol_no')>100 then raise exception 'Protocol number required' using errcode='22023'; end if;
     select count(*) into cnt from public.committee_meeting_members where meeting_id=mid;
     if cnt<m.required_quorum or cnt=0 or exists(select 1 from public.committee_meeting_members where meeting_id=mid and not coalesce(attended,false)) then raise exception 'All assigned members must be present' using errcode='23514'; end if;
     if not exists(select 1 from public.committee_agenda_items where meeting_id=mid) then raise exception 'Empty protocol cannot be issued' using errcode='23514'; end if;
     for item in select * from public.committee_agenda_items where meeting_id=mid order by id loop
       select count(*)=cnt and bool_and(vote='for'),count(*)=cnt and bool_and(vote='against') into unanimous_for,unanimous_against from public.committee_votes v join public.committee_meeting_members mm on mm.member_id=v.member_id and mm.meeting_id=mid where v.agenda_item_id=item.id;
       if not coalesce(unanimous_for or unanimous_against,false) then raise exception 'Every assigned member must vote unanimously for or against each item' using errcode='23514'; end if;
       update public.committee_agenda_items set outcome=case when unanimous_for then 'recommend_approve' else 'recommend_reject' end where id=item.id;
     end loop;
     select jsonb_build_object('meeting_id',mid,'protocol_no',trim(p_data->>'protocol_no'),'notes',p_data->>'notes','members',(select jsonb_agg(jsonb_build_object('member_id',member_id,'is_chair',is_chair) order by member_id) from public.committee_meeting_members where meeting_id=mid),'items',(select jsonb_agg(to_jsonb(a) order by a.id) from public.committee_agenda_items a where a.meeting_id=mid),'votes',(select jsonb_agg(to_jsonb(v) order by v.id) from public.committee_votes v join public.committee_agenda_items a on a.id=v.agenda_item_id where a.meeting_id=mid)) into snapshot;
     update public.committee_meetings set protocol_no=trim(p_data->>'protocol_no'),protocol_notes=p_data->>'notes',protocol_date=current_date,protocol_snapshot=snapshot,status='signing' where id=mid;
   elsif p_action='sign' then
     if m.status<>'signing' or m.protocol_snapshot is null then raise exception 'The protocol has not been prepared' using errcode='23514'; end if;
     update public.committee_meeting_members set signed_at=now() where meeting_id=mid and member_id=actor and signed_at is null;
     get diagnostics affected=row_count;
     if affected<>1 then raise exception 'Only an unsigned assigned member can sign' using errcode='42501'; end if;
   elsif p_action='issue' then
     if m.status<>'signing' or m.protocol_snapshot is null or exists(select 1 from public.committee_meeting_members where meeting_id=mid and signed_at is null) then raise exception 'All assigned members must sign the frozen protocol' using errcode='23514'; end if;
     update public.committee_meetings set status='held' where id=mid;
     for item in select * from public.committee_agenda_items where meeting_id=mid order by loan_id loop
       select * into l from public.loan_applications where id=item.loan_id for update;
       if l.status not in ('kkg_review','verification') then raise exception 'Application state changed; protocol cannot be issued' using errcode='40001'; end if;
       if l.status='verification' and not exists(select 1 from public.verifications where loan_id=l.id and status='completed' and outcome<>'not_confirmed') then raise exception 'Verification incomplete' using errcode='23514'; end if;
       nxt:=case when item.outcome='recommend_approve' then 'kkg_protocol' else 'rejected' end;
       update public.loan_applications set status=nxt,current_step=10 where id=l.id;
       insert into public.loan_application_history(loan_id,action,old_status,new_status,performed_by,notes) values(l.id,'status_change',l.status,nxt,actor,'Signed committee protocol '||m.protocol_no);
       update public.committee_agenda_items set decided_at=now() where id=item.id;
     end loop;
     update public.committee_meetings set status='closed',held_at=now() where id=mid;
   elsif p_action='cancel' then
     if m.status='signing' then raise exception 'Signed protocol cannot be cancelled' using errcode='23514'; end if;
     update public.committee_meetings set status='cancelled' where id=mid;
   else raise exception 'Unknown committee action' using errcode='22023'; end if;
 end if;
 insert into public.audit_trail(table_name,record_id,action,changed_by,new_data) values('committee_meetings',mid,'COMMITTEE_'||upper(p_action),actor,jsonb_build_object('meeting_id',mid,'input',p_data));
 return mid;
end $$;
revoke all on function public.cgf_committee_action(text,uuid,jsonb) from public,anon;
grant execute on function public.cgf_committee_action(text,uuid,jsonb) to authenticated;
revoke insert,update,delete on public.committee_meetings,public.committee_meeting_members,public.committee_agenda_items,public.committee_votes from authenticated,anon;
revoke all on function cgf_private.next_working_day(timestamptz),cgf_private.guard_committee_immutable() from public,anon,authenticated;
